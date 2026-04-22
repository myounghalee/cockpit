import { spawn, type IPty } from "node-pty";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import type { WebSocket } from "ws";
import { RingBuffer } from "./ring-buffer";

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

export class PtyManager {
  private records = new Map<string, PtyRecord>();

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
    };

    pty.onData((data) => {
      record.buffer.write(data);
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
  }
}

export function getPtyManager(): PtyManager {
  const g = globalThis as unknown as { __cockpitPtyManager?: PtyManager };
  if (!g.__cockpitPtyManager) {
    g.__cockpitPtyManager = new PtyManager();
  }
  return g.__cockpitPtyManager;
}
