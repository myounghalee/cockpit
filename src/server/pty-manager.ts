import { spawn, type IPty } from "node-pty";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import type { WebSocket } from "ws";
import { RingBuffer } from "./ring-buffer";

export interface PtyStatus {
  busy: boolean;
  command: string | null;
  /**
   * busy 상태인데 최근 N초 출력이 없어 사용자 응답을 기다리는 상태.
   * busy=false 일 땐 항상 false.
   */
  awaitingInput: boolean;
}

export interface PtyRecord {
  id: string;
  pty: IPty;
  cwd: string;
  shell: string;
  createdAt: Date;
  buffer: RingBuffer;
  subscribers: Set<WebSocket>;
  idleTimer?: NodeJS.Timeout;
  exited: boolean;
  /** 자식 프로세스 감지 기반 상태 (서버 폴링으로 업데이트) */
  status: PtyStatus;
  /** pty.onData 가 마지막으로 발동한 시각 — awaitingInput 판정용 */
  lastOutputAt: number;
  /** onData 배칭 버퍼 — 짧은 시간 내 연속 출력은 한 메시지로 합쳐 구독자에게 전송 */
  pendingOutput?: string;
  pendingFlushTimer?: NodeJS.Timeout;
  /** OSC notification 파서가 청크 경계를 넘는 미완 시퀀스를 보관 */
  oscFragment?: string;
}

/** onData 배칭 윈도 — 이 시간 안에 들어온 연속 출력은 1개 메시지로 합쳐 보냄. */
const OUTPUT_FLUSH_MS = 8;
/** WebSocket bufferedAmount 경고 임계값 (10MB). 초과 시 warn 로그 1회. */
const WS_BACKPRESSURE_WARN_BYTES = 10 * 1024 * 1024;

/**
 * awaitingInput 판정 관련 상수.
 *   MIN_IDLE_MS   — 이 시간 미만이면 "출력 활발"으로 간주하고 판정 스킵
 *   HARD_IDLE_MS  — 이 시간 이상 출력 없으면 패턴 없어도 대기로 판정 (fallback)
 *   PATTERN_SCAN_BYTES — 버퍼 끝 이만큼만 패턴 매칭 (터미널 리렌더로 뒤에 와야 의미)
 */
const MIN_IDLE_MS = 800;
const HARD_IDLE_MS = 7000;
const PATTERN_SCAN_BYTES = 4000;

/**
 * 버퍼 끝부분을 검사해 "사용자 응답을 기다리는 상태"인지 판정.
 * Claude Code 의 선택지 박스, 일반 (y/n) 프롬프트, shell read 등을 커버.
 */
function looksLikeAwaitingInput(text: string): boolean {
  // ANSI escape 시퀀스 제거 (curses/ANSI 스타일이 패턴 깨는 걸 방지)
  const clean = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  return (
    // Claude Code 선택지 UI
    /\n\s*(?:❯|>)\s*\d+\.\s+/.test(clean) ||
    /\bEsc to cancel\b/.test(clean) ||
    /Do you want to (?:proceed|continue)/i.test(clean) ||
    // 일반 CLI 프롬프트
    /\((?:y\/n|Y\/n|y\/N|yes\/no)\)/i.test(clean) ||
    /\[(?:Y\/n|y\/N)\]/i.test(clean) ||
    /Continue\?/i.test(clean) ||
    // 선택지 리스트 (Press 1/2/3 등)
    /\bPress\s+\w+\s+to\b/i.test(clean)
  );
}

export interface CreatePtyOptions {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}

const IS_WIN = process.platform === "win32";

const ALLOWED_SHELLS_UNIX = new Set(["/bin/zsh", "/bin/bash", "/bin/sh"]);
const ALLOWED_SHELLS_WIN = new Set([
  "powershell.exe",
  "pwsh.exe",
  "cmd.exe",
  "bash.exe", // Git Bash
  "wsl.exe",  // WSL
]);

function resolveShell(requested?: string): string {
  if (IS_WIN) {
    const candidate =
      requested ?? process.env.SHELL_PATH ?? "powershell.exe";
    const basename = candidate.toLowerCase().split(/[/\\]/).pop()!;
    if (ALLOWED_SHELLS_WIN.has(basename)) {
      return candidate;
    }
    return process.env.COMSPEC ?? "cmd.exe";
  }
  const envShell = process.env.SHELL_PATH;
  const candidate = requested ?? envShell ?? process.env.SHELL ?? "/bin/zsh";
  if (!ALLOWED_SHELLS_UNIX.has(candidate)) {
    return "/bin/zsh";
  }
  return candidate;
}

/**
 * PTY에 전달할 환경변수에서 Cockpit 서버 고유 변수를 제거.
 *
 * - Claude Desktop에서 실행 시 ANTHROPIC_API_KEY(빈 값) 등이 자식 프로세스
 *   (Claude CLI)에 전달되어 인증 오류를 유발하는 문제 방지.
 * - NODE_ENV: packaged Electron 이 server 에 NODE_ENV=production 을 주입하는데,
 *   내장 터미널이 이를 그대로 상속하면 `pnpm install` 시 devDependencies 가
 *   스킵되는 등 개발 작업이 막히는 부작용. 자식 쉘은 기본값(unset)으로 시작하게 함.
 */
function cleanEnvForPty(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const REMOVE_PREFIXES = [
    "ANTHROPIC_",
    "CLAUDE_CODE_",
    "CLAUDE_AGENT_",
    "CLAUDE_INTERNAL_",
    "CLAUDECODE",
  ];
  const REMOVE_EXACT = new Set(["NODE_ENV"]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (REMOVE_EXACT.has(key)) continue;
    if (REMOVE_PREFIXES.some((p) => key.startsWith(p))) continue;
    result[key] = value;
  }
  return result;
}

function resolveCwd(requested?: string): string {
  const home = os.homedir();
  const candidate = requested ?? process.env.DEFAULT_CWD ?? home;
  try {
    const resolved = path.resolve(candidate);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return home;
    return resolved;
  } catch {
    return home;
  }
}

function getBufferMaxBytes(): number {
  const kb = Number(process.env.COCKPIT_PTY_BUFFER_KB ?? "256");
  if (!Number.isFinite(kb) || kb <= 0) return 256 * 1024;
  return Math.min(Math.max(kb, 16), 4096) * 1024; // 16KB ~ 4MB
}

function getIdleTimeoutMs(): number {
  const raw = process.env.COCKPIT_PTY_IDLE_TIMEOUT_MS;
  if (raw === undefined) return 30 * 60 * 1000; // 기본 30분
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 30 * 60 * 1000;
  if (n === 0) return 0; // 0 = 비활성
  return Math.min(n, 24 * 60 * 60 * 1000); // max 24h
}

/** OSC notification — 발견 시 발생시킨 알림 1건. */
export interface OscNotification {
  title: string;
  body: string;
}

/** 알림 본문/제목의 최대 길이 (UI 표시용 + 메모리 보호). */
const OSC_FIELD_MAX_LEN = 1024;
/** 미완 OSC fragment 상한 — ESC ] 로 시작했지만 BEL/ST 가 안 온 상태에서 보관할 최대 길이. */
const OSC_FRAGMENT_MAX_LEN = 8192;

/**
 * 청크에서 OSC 9 / 99 / 777 알림 시퀀스를 추출.
 * 출력 스트림은 변형하지 않음 (xterm.js 가 알 수 없는 OSC 는 무시함).
 *
 * 지원 형식 (terminator: BEL `\x07` 또는 ST `\x1b\\`):
 *   - `ESC ] 9 ; <body> BEL`              (iTerm style — title 없음)
 *   - `ESC ] 99 ; <meta> ; <body> BEL`    (Ghostty/ConEmu — meta 는 `k=v:k=v`)
 *   - `ESC ] 777 ; notify ; <title> ; <body> BEL`  (urxvt/KDE)
 *
 * 청크 경계로 잘린 미완 시퀀스는 `record.oscFragment` 에 보관해 다음 청크와 합쳐 재시도.
 */
export function extractOscNotifications(
  record: { oscFragment?: string },
  chunk: string,
): OscNotification[] {
  const buf = (record.oscFragment ?? "") + chunk;
  record.oscFragment = undefined;

  const results: OscNotification[] = [];

  // 빠른 경로: ESC ] 가 아예 없으면 즉시 종료.
  if (buf.indexOf("\x1b]") === -1) return results;

  // 완성된 OSC 9/99/777 만 매칭. payload 안에는 BEL/ESC 가 없는 것으로 가정 (RFC 부합).
  const pattern = /\x1b\](9|99|777);([^\x07\x1b]*?)(\x07|\x1b\\)/g;
  let lastMatchEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(buf)) !== null) {
    const noti = parseOscPayload(m[1], m[2]);
    if (noti) results.push(clampNotification(noti));
    lastMatchEnd = pattern.lastIndex;
  }

  // 마지막 매치 이후의 영역에 미완 OSC 가 있는지 확인.
  // (`ESC ]` 시작했으나 terminator 없음 → 다음 청크와 합치도록 보관.)
  const tailEsc = buf.indexOf("\x1b]", lastMatchEnd);
  if (tailEsc !== -1) {
    const tail = buf.slice(tailEsc);
    // terminator 가 이미 들어있다면 이건 매칭 안 된 다른 OSC (e.g. OSC 0 = title) 이므로 무시.
    if (!/\x07|\x1b\\/.test(tail) && tail.length <= OSC_FRAGMENT_MAX_LEN) {
      record.oscFragment = tail;
    }
  }

  return results;
}

function parseOscPayload(code: string, payload: string): OscNotification | null {
  if (code === "9") {
    const body = payload.trim();
    if (!body) return null;
    return { title: "", body };
  }
  if (code === "777") {
    // `notify ; <title> ; <body...>` — body 안에 ;가 있으면 합쳐서 보존.
    const parts = payload.split(";");
    if (parts[0] !== "notify" || parts.length < 2) return null;
    const title = parts[1] ?? "";
    const body = parts.slice(2).join(";");
    if (!title && !body) return null;
    return { title, body };
  }
  if (code === "99") {
    // `<meta>;<body>` — meta 는 `k=v:k=v`. body 가 비면 meta.t 만 있는 경우 가능.
    const sep = payload.indexOf(";");
    const meta = sep === -1 ? payload : payload.slice(0, sep);
    const body = sep === -1 ? "" : payload.slice(sep + 1);
    let title = "";
    for (const pair of meta.split(":")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1);
      if (k === "t" || k === "title") title = decodeURIComponent(v);
    }
    if (!title && !body) return null;
    return { title, body };
  }
  return null;
}

function clampNotification(n: OscNotification): OscNotification {
  return {
    title: n.title.slice(0, OSC_FIELD_MAX_LEN),
    body: n.body.slice(0, OSC_FIELD_MAX_LEN),
  };
}

/**
 * pending 배치 버퍼를 구독자들에게 플러시.
 * OUTPUT_FLUSH_MS 윈도 동안 누적된 출력을 한 output 메시지로 결합해 전송.
 */
function flushPendingOutput(record: PtyRecord): void {
  if (record.pendingFlushTimer) {
    clearTimeout(record.pendingFlushTimer);
    record.pendingFlushTimer = undefined;
  }
  const data = record.pendingOutput;
  record.pendingOutput = undefined;
  if (!data) return;
  for (const ws of record.subscribers) {
    send(ws, { type: "output", data });
  }
}

function send(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) {
    // 백프레셔 감지 — 임계값 초과 시 1회 warn. 실제 drop 은 하지 않음(데이터 손실 방지).
    const buffered = (ws as WebSocket & { bufferedAmount?: number }).bufferedAmount;
    if (
      typeof buffered === "number" &&
      buffered > WS_BACKPRESSURE_WARN_BYTES &&
      !(ws as WebSocket & { _cockpitBackpressureWarned?: boolean })
        ._cockpitBackpressureWarned
    ) {
      (ws as WebSocket & { _cockpitBackpressureWarned?: boolean })
        ._cockpitBackpressureWarned = true;
      console.warn(
        `[pty] WebSocket backpressure: ${Math.round(buffered / 1024 / 1024)}MB buffered`,
      );
    }
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // ignore
    }
  }
}

/**
 * 시스템의 전체 프로세스 목록에서 ppid → [comm, ...] 맵 한 번에 조회.
 * 여러 PTY가 있어도 ps 를 1회만 실행하도록 공통화.
 * macOS/Linux 호환 (`ps -ax -o pid=,ppid=,comm=`).
 */
function queryProcessMap(): Promise<Map<number, string[]>> {
  return new Promise((resolve) => {
    execFile(
      "ps",
      ["-ax", "-o", "pid=,ppid=,comm="],
      { timeout: 2000, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(new Map());
          return;
        }
        const map = new Map<number, string[]>();
        for (const line of stdout.split("\n")) {
          const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
          if (!m) continue;
          const ppid = Number(m[2]);
          const commFull = m[3].trim();
          // 실행 경로의 마지막 이름만 (예: "/usr/bin/node" → "node")
          const comm = commFull.split(/[/\\]/).pop() ?? commFull;
          const arr = map.get(ppid) ?? [];
          arr.push(comm);
          map.set(ppid, arr);
        }
        resolve(map);
      },
    );
  });
}

/** 자식 comm 배열에서 가장 의미 있는 하나 선택 (shell 자신은 제외) */
function pickPrimaryCommand(comms: string[]): string | null {
  if (comms.length === 0) return null;
  const nonShell = comms.find(
    (c) => !/^-?(zsh|bash|sh|fish|dash)$/i.test(c.replace(/^-/, "")),
  );
  return nonShell ?? comms[0];
}

export class PtyManager {
  private records = new Map<string, PtyRecord>();
  private statusPollTimer?: NodeJS.Timeout;

  constructor() {
    // 1초마다 모든 PTY 의 자식 프로세스 상태 폴링.
    // ps 를 한 번만 돌려 프로세스 맵 구성 → 각 PTY 가 자기 pid 로 lookup.
    this.statusPollTimer = setInterval(() => {
      void this.pollStatuses();
    }, 1000);
    // Node 가 이 interval 때문에 종료 못 하는 일 방지
    if (typeof this.statusPollTimer.unref === "function") {
      this.statusPollTimer.unref();
    }
  }

  private async pollStatuses(): Promise<void> {
    if (this.records.size === 0) return;
    const procMap = await queryProcessMap();
    const now = Date.now();
    for (const [id, record] of this.records) {
      if (record.exited) continue;
      const children = procMap.get(record.pty.pid) ?? [];
      const busy = children.length > 0;
      const command = busy ? pickPrimaryCommand(children) : null;

      // awaitingInput 판정:
      //   - 출력이 충분히 멎었고 (활발히 출력 중이면 아직 생각/처리 중)
      //   - busy 상태이며
      //   - 버퍼 끝에 입력 대기 패턴이 있거나, 7초+ 조용 (fallback)
      let awaitingInput = false;
      if (busy) {
        const idleMs = now - record.lastOutputAt;
        if (idleMs >= MIN_IDLE_MS) {
          const tail = record.buffer.snapshot().slice(-PATTERN_SCAN_BYTES);
          awaitingInput =
            looksLikeAwaitingInput(tail) || idleMs >= HARD_IDLE_MS;
        }
      }

      const prev = record.status;
      if (
        prev.busy !== busy ||
        prev.command !== command ||
        prev.awaitingInput !== awaitingInput
      ) {
        record.status = { busy, command, awaitingInput };
        for (const ws of record.subscribers) {
          send(ws, { type: "status", busy, command, awaitingInput });
        }
      }
    }
  }

  create(options: CreatePtyOptions = {}): PtyRecord {
    const id = randomUUID();
    const shell = resolveShell(options.shell);
    const cwd = resolveCwd(options.cwd);

    // --login 플래그로 로그인 셸 실행 → .zshrc/.bash_profile 로드 (Claude CLI 인증 등)
    const shellArgs = IS_WIN ? [] : ["--login"];
    const pty = spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd,
      env: {
        ...cleanEnvForPty(process.env),
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        COCKPIT_SESSION: id,
      },
    });

    const record: PtyRecord = {
      id,
      pty,
      cwd,
      shell,
      createdAt: new Date(),
      buffer: new RingBuffer(getBufferMaxBytes()),
      subscribers: new Set(),
      exited: false,
      status: { busy: false, command: null, awaitingInput: false },
      lastOutputAt: Date.now(),
    };

    pty.onData((data) => {
      record.buffer.write(data);
      record.lastOutputAt = Date.now();

      // OSC notification 추출 — 출력 스트림은 그대로 두고 알림만 별도 broadcast.
      const notifications = extractOscNotifications(record, data);
      if (notifications.length > 0) {
        for (const n of notifications) {
          for (const ws of record.subscribers) {
            send(ws, { type: "notification", title: n.title, body: n.body });
          }
        }
      }

      // 배칭: 연속 출력은 OUTPUT_FLUSH_MS 윈도 안에서 한 메시지로 합침.
      // UTF-8 경계는 node-pty 가 StringDecoder 로 이미 보장(string 전달)하므로
      // 여기서는 단순 문자열 concat 안전.
      if (record.pendingOutput == null) {
        record.pendingOutput = data;
      } else {
        record.pendingOutput += data;
      }
      if (!record.pendingFlushTimer) {
        record.pendingFlushTimer = setTimeout(() => {
          flushPendingOutput(record);
        }, OUTPUT_FLUSH_MS);
      }
    });

    pty.onExit(({ exitCode }) => {
      // 종료 전 남은 pending 을 먼저 내보내 마지막 라인 누락 방지
      flushPendingOutput(record);
      record.exited = true;
      for (const ws of record.subscribers) {
        send(ws, { type: "exit", code: exitCode });
      }
      // 종료 시에는 일정 시간 후 정리 (클라가 exit 메시지를 수신할 시간)
      setTimeout(() => {
        this.records.delete(id);
        if (record.idleTimer) clearTimeout(record.idleTimer);
        if (record.pendingFlushTimer) clearTimeout(record.pendingFlushTimer);
      }, 2000);
    });

    this.records.set(id, record);
    return record;
  }

  get(id: string): PtyRecord | undefined {
    return this.records.get(id);
  }

  list(): Array<{
    id: string;
    cwd: string;
    shell: string;
    pid: number;
    createdAt: Date;
    bufferBytes: number;
    subscribers: number;
  }> {
    return Array.from(this.records.values()).map((r) => ({
      id: r.id,
      cwd: r.cwd,
      shell: r.shell,
      createdAt: r.createdAt,
      pid: r.pty.pid,
      bufferBytes: r.buffer.byteSize,
      subscribers: r.subscribers.size,
    }));
  }

  addSubscriber(id: string, ws: WebSocket): void {
    const r = this.records.get(id);
    if (!r) return;
    r.subscribers.add(ws);
    if (r.idleTimer) {
      clearTimeout(r.idleTimer);
      r.idleTimer = undefined;
    }
  }

  removeSubscriber(id: string, ws: WebSocket): void {
    const r = this.records.get(id);
    if (!r) return;
    r.subscribers.delete(ws);
    if (r.subscribers.size === 0) {
      this.startIdleTimer(id);
    }
  }

  private startIdleTimer(id: string): void {
    const r = this.records.get(id);
    if (!r) return;
    const ms = getIdleTimeoutMs();
    if (ms <= 0) return;
    if (r.idleTimer) clearTimeout(r.idleTimer);
    r.idleTimer = setTimeout(() => {
      const cur = this.records.get(id);
      if (!cur || cur.subscribers.size > 0) return;
      console.log(
        `[pty-manager] idle timeout reached for ${id}, disposing`,
      );
      this.dispose(id);
    }, ms);
  }

  dispose(id: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.idleTimer) clearTimeout(record.idleTimer);
    if (record.pendingFlushTimer) clearTimeout(record.pendingFlushTimer);
    try {
      record.pty.kill();
    } catch {
      // ignore
    }
    this.records.delete(id);
    return true;
  }

  disposeAll(): void {
    for (const id of Array.from(this.records.keys())) {
      this.dispose(id);
    }
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = undefined;
    }
  }
}

export function getPtyManager(): PtyManager {
  const g = globalThis as unknown as { __cockpitPtyManager?: PtyManager };
  if (!g.__cockpitPtyManager) {
    g.__cockpitPtyManager = new PtyManager();
  }
  return g.__cockpitPtyManager;
}
