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
}

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
 * Claude Desktop에서 실행 시 ANTHROPIC_API_KEY(빈 값) 등이
 * 자식 프로세스(Claude CLI)에 전달되어 인증 오류를 유발하는 문제 방지.
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
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
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

function send(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) {
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
      for (const ws of record.subscribers) {
        send(ws, { type: "output", data });
      }
    });

    pty.onExit(({ exitCode }) => {
      record.exited = true;
      for (const ws of record.subscribers) {
        send(ws, { type: "exit", code: exitCode });
      }
      // 종료 시에는 일정 시간 후 정리 (클라가 exit 메시지를 수신할 시간)
      setTimeout(() => {
        this.records.delete(id);
        if (record.idleTimer) clearTimeout(record.idleTimer);
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
