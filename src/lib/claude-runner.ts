/**
 * 칸반에서 백그라운드로 Claude CLI(`-p` + stream-json)를 실행하는 매니저.
 *
 * - 티켓당 하나의 프로세스만 실행
 * - stream-json(JSONL) 파싱 → tool_use 이벤트를 구조화된 action으로 추출
 * - raw stdout은 로그 파일로, action은 별도 .actions.jsonl로 저장(backfill용)
 * - EventEmitter로 data/action/exit 이벤트 브로드캐스트
 * - 프로세스 exit 시 ticket status를 "review"로 자동 전환
 * - Next.js dev hot-reload를 견디도록 globalThis에 싱글톤 캐시
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { prisma } from "./prisma";
import { buildClaudePrompt } from "./claude-prompt";
import { nextPdcaStage, type PdcaStage } from "./pdca-prompts";
import {
  stageAll,
  commitChanges,
  pushRemote,
  isGitRepo,
  getStatus,
  getBranches,
  checkoutBranch,
  pullRemote,
  createBranch,
} from "./git";

export interface RunState {
  ticketId: string;
  pid: number;
  logPath: string;
  actionsPath: string;
  startedAt: string;
  sessionId: string;
  stage: string | null;
}

export interface RunnerAction {
  id: string; // tool_use_id (동일 도구의 시작~완료 매칭용)
  ts: string; // ISO timestamp
  name: string; // tool name: Edit, Read, Write, Bash, Glob, Grep, WebFetch …
  summary: string; // one-line 요약 (file_path, command 등)
  status: "running" | "done" | "error";
}

interface RunnerEvents {
  data: (ticketId: string, chunk: string) => void;
  action: (ticketId: string, action: RunnerAction) => void;
  exit: (ticketId: string, code: number | null) => void;
}

/**
 * 티켓 작업용 브랜치를 준비한다.
 *   - git repo가 아니면 skip
 *   - working tree가 dirty면 skip (사용자 데이터 보호)
 *   - 이미 티켓 브랜치에 있으면 skip
 *   - 티켓 브랜치가 이미 존재하면 checkout만
 *   - 없으면 기본 브랜치(main/master) checkout → pull → 새 브랜치 생성 + checkout
 *
 * 실패는 로그만 남기고 runner는 계속 진행 (치명적이지 않음).
 */
async function prepareBranch(
  cwd: string,
  ticketKey: string,
): Promise<string | null> {
  const targetBranch = `ticket/${ticketKey}`;
  try {
    if (!(await isGitRepo(cwd))) return "git repo 아님 — skip";

    const status = await getStatus(cwd);
    if (status.currentBranch === targetBranch) {
      return `이미 ${targetBranch} 브랜치 작업 중`;
    }
    if (!status.isClean) {
      return `working tree dirty — 브랜치 전환 skip (변경사항 먼저 커밋/스태시 필요)`;
    }

    const { local } = await getBranches(cwd);
    const existing = local.find((b) => b.name === targetBranch);
    if (existing) {
      await checkoutBranch(cwd, targetBranch);
      return `${targetBranch} 로 checkout`;
    }

    // 기본 브랜치 검출 (main 우선, 없으면 master)
    const base = local.find(
      (b) => b.name === "main" || b.name === "master",
    );
    const baseName = base?.name ?? status.currentBranch;

    if (baseName && baseName !== status.currentBranch) {
      await checkoutBranch(cwd, baseName);
    }
    try {
      await pullRemote(cwd);
    } catch {
      // upstream 없거나 오프라인 — 진행
    }
    await createBranch(cwd, targetBranch);
    await checkoutBranch(cwd, targetBranch);
    return `${baseName} pull → ${targetBranch} 생성/checkout`;
  } catch (err) {
    return `실패: ${(err as Error).message}`;
  }
}

/**
 * report.md 전체를 PR 본문으로 사용 (없으면 fallback). 동기 I/O 사용 (짧고 비치명적).
 */
function prBodyFromReport(cwd: string, key: string): string {
  const filePath = path.join(cwd, "docs", "pdca", key, "report.md");
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return `[PDCA] ${key} 사이클 완료`;
  }
}

/**
 * report.md에서 "## 커밋 메시지" 섹션을 뽑아내 그대로 git commit 메시지로 반환.
 * 섹션 내 첫 비어있지 않은 블록을 제목, 나머지를 본문으로 취급.
 */
function extractCommitMessage(report: string): string {
  const lines = report.split("\n");
  const headingRe = /^#+\s+커밋\s*메시지/i;
  const nextHeadingRe = /^#+\s+/;
  let inSection = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (!inSection) {
      if (headingRe.test(line)) inSection = true;
      continue;
    }
    if (nextHeadingRe.test(line)) break;
    collected.push(line);
  }
  // 연속된 빈줄 축약 + 앞뒤 공백 정리
  return collected
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** tool_use의 input 객체를 한 줄 요약으로 변환 */
function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const rec = input as Record<string, unknown>;
  const s = (v: unknown, max = 80): string => {
    if (typeof v !== "string") return "";
    return v.length > max ? v.slice(0, max) + "…" : v;
  };
  switch (name) {
    case "Edit":
    case "Write":
    case "Read":
    case "NotebookEdit":
      return s(rec.file_path);
    case "Bash":
      return s(rec.command, 100);
    case "Glob":
      return s(rec.pattern);
    case "Grep":
      return s(rec.pattern) + (rec.path ? ` @ ${s(rec.path)}` : "");
    case "WebFetch":
    case "WebSearch":
      return s(rec.url ?? rec.query);
    case "Task":
      return s(rec.description);
    case "TodoWrite":
      return "(할 일 목록 갱신)";
    default: {
      // 모르는 도구는 첫 string 필드를 요약
      for (const v of Object.values(rec)) {
        if (typeof v === "string") return s(v);
      }
      return "";
    }
  }
}

class Runner extends EventEmitter {
  private processes = new Map<string, ChildProcess>();
  private states = new Map<string, RunState>();
  /** 스트림 파싱 중 라인 경계에 걸친 잔여 버퍼 */
  private buffers = new Map<string, string>();

  on<E extends keyof RunnerEvents>(ev: E, fn: RunnerEvents[E]): this {
    return super.on(ev, fn);
  }
  off<E extends keyof RunnerEvents>(ev: E, fn: RunnerEvents[E]): this {
    return super.off(ev, fn);
  }

  isRunning(ticketId: string): boolean {
    return this.processes.has(ticketId);
  }

  getState(ticketId: string): RunState | null {
    return this.states.get(ticketId) ?? null;
  }

  getLogPath(ticketId: string): string {
    return path.join(LOG_DIR, `${ticketId}.log`);
  }

  getActionsPath(ticketId: string): string {
    return path.join(LOG_DIR, `${ticketId}.actions.jsonl`);
  }

  async start(ticketId: string): Promise<RunState> {
    if (this.processes.has(ticketId)) {
      throw new Error("이미 실행 중인 작업이 있습니다.");
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { project: { select: { path: true } } },
    });
    if (!ticket) throw new Error("티켓을 찾을 수 없습니다.");

    const sessionId = ticket.sessionId ?? crypto.randomUUID();
    if (!ticket.sessionId) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { sessionId },
      });
    }

    const isResume = !!ticket.sessionId;
    const prompt = buildClaudePrompt(ticket);

    const args: string[] = [
      "-p",
      prompt,
      "--dangerously-skip-permissions",
      "--output-format",
      "stream-json",
      "--verbose",
    ];
    if (isResume) {
      args.push("--resume", sessionId);
    } else {
      args.push("--session-id", sessionId);
    }

    await fsp.mkdir(LOG_DIR, { recursive: true });
    const logPath = path.join(LOG_DIR, `${ticketId}.log`);
    const actionsPath = path.join(LOG_DIR, `${ticketId}.actions.jsonl`);
    const separator = `\n=== [${new Date().toISOString()}] stage=${
      ticket.pdcaStage ?? "(none)"
    } session=${sessionId} ===\n`;
    await fsp.appendFile(logPath, separator, "utf8");

    // 첫 실행 시에만 브랜치 준비 (Plan 단계에서만)
    // Design/Do/... 단계로 이어갈 때는 이미 같은 브랜치에서 작업 중
    if (ticket.pdcaStage === "plan") {
      const branchLog = await prepareBranch(
        ticket.project.path,
        ticket.jiraKey ?? ticketId,
      );
      if (branchLog) {
        await fsp.appendFile(logPath, `[branch] ${branchLog}\n`, "utf8");
      }
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "in_progress",
        startedAt: ticket.startedAt ?? new Date(),
      },
    });

    const child = spawn("claude", args, {
      cwd: ticket.project.path,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (!child.pid) {
      throw new Error("claude 프로세스 시작 실패 (CLI가 PATH에 없는지 확인)");
    }

    const state: RunState = {
      ticketId,
      pid: child.pid,
      logPath,
      actionsPath,
      startedAt: new Date().toISOString(),
      sessionId,
      stage: ticket.pdcaStage ?? null,
    };
    this.processes.set(ticketId, child);
    this.states.set(ticketId, state);
    this.buffers.set(ticketId, "");

    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const actionsStream = fs.createWriteStream(actionsPath, { flags: "a" });

    const onStdout = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logStream.write(text);
      this.emit("data", ticketId, text);
      this.parseStreamJson(ticketId, text, actionsStream);
    };
    const onStderr = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logStream.write(`[stderr] ${text}`);
      this.emit("data", ticketId, `[stderr] ${text}`);
    };

    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);

    child.on("close", async (code) => {
      logStream.end(
        `\n--- exit ${code} at ${new Date().toISOString()} ---\n`,
      );
      actionsStream.end();
      this.processes.delete(ticketId);
      this.states.delete(ticketId);
      this.buffers.delete(ticketId);
      try {
        const data: { status: string; sessionId?: null } = { status: "review" };
        // 첫 실행이 실패하면 DB에 박힌 sessionId를 롤백.
        // 그대로 두면 다음 "Claude 열기"가 --resume <없는세션> 을 호출해 "No conversation found"로 깨짐.
        if (!isResume && code !== 0) {
          data.sessionId = null;
        }
        await prisma.ticket.update({
          where: { id: ticketId },
          data,
        });
      } catch {
        // 삭제된 티켓
      }
      this.emit("exit", ticketId, code);

      // exit code != 0이면 자동 진행 중단 (오류 가능)
      if (code === 0) {
        // 비동기로 자동 흐름 처리 (이벤트 emit 이후)
        this.handleAutoFlow(ticketId).catch((err) => {
          console.error(
            `[runner] auto-flow failed for ${ticketId}:`,
            (err as Error).message,
          );
        });
      }
    });

    child.on("error", (err) => {
      logStream.write(`\n[spawn error] ${err.message}\n`);
    });

    return state;
  }

  /**
   * 단계 종료 후 autoMode에 따라 자동으로 다음 단계를 실행하거나,
   * 마지막 단계(report)였으면 commitMode에 따라 git 커밋/푸시를 수행한다.
   */
  private async handleAutoFlow(ticketId: string): Promise<void> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { project: { select: { path: true } } },
    });
    if (!ticket) return;

    const stage = ticket.pdcaStage as PdcaStage | null;
    if (!stage) return;

    const shouldAutoAdvance =
      ticket.autoMode === "full" ||
      (ticket.autoMode === "after_plan" && stage !== "plan");
    // "manual"이거나 "after_plan" + stage==="plan"이면 여기서 멈춤 (사용자 승인 대기)
    if (!shouldAutoAdvance && stage !== "report") {
      return;
    }

    const next = nextPdcaStage(stage);
    if (next) {
      // 다음 단계로 자동 전환 + runner 재시작
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { pdcaStage: next, status: "in_progress" },
      });
      // 약간의 지연 — exit 이벤트 소비자들이 상태를 갱신할 시간을 확보
      await new Promise((r) => setTimeout(r, 400));
      await this.start(ticketId);
      return;
    }

    // stage === "report" && (autoMode 상관없이) commitMode 처리
    // Report 단계가 끝나면 사용자가 "manual"이어도 옵션으로 자동 커밋을 원할 수 있음.
    // 단, "manual" 모드에서는 Report 전 단계가 이미 사용자 승인으로 도달했으니
    // 자동 커밋 역시 사용자 의사 반영으로 본다.
    if (stage === "report" && ticket.commitMode && ticket.commitMode !== "none") {
      await this.doGitCommitFlow(ticket, ticket.project.path).catch((err) => {
        console.error(
          `[runner] git commit/push failed for ${ticketId}:`,
          (err as Error).message,
        );
      });
    }
  }

  private async doGitCommitFlow(
    ticket: { id: string; jiraKey: string | null; commitMode: string },
    cwd: string,
  ): Promise<void> {
    // 1) report.md에서 커밋 메시지 추출
    const reportPath = path.join(
      cwd,
      "docs",
      "pdca",
      ticket.jiraKey ?? ticket.id,
      "report.md",
    );
    let message = "";
    try {
      const content = await fsp.readFile(reportPath, "utf8");
      message = extractCommitMessage(content);
    } catch {
      // fallback
    }
    if (!message.trim()) {
      message = `[PDCA] ${ticket.jiraKey ?? ticket.id} 완료`;
    }

    const logPath = this.getLogPath(ticket.id);
    const log = (text: string) =>
      fs.appendFileSync(logPath, text, { encoding: "utf8" });

    log(`\n--- [auto-commit] 시작 ---\n`);
    try {
      await stageAll(cwd);
      log(`[auto-commit] stage all ✓\n`);
      const hash = await commitChanges(cwd, message);
      log(`[auto-commit] commit ✓ (${hash || "?"}): ${message.split("\n")[0]}\n`);
      if (
        ticket.commitMode === "commit_push" ||
        ticket.commitMode === "commit_push_pr"
      ) {
        const pushOut = await pushRemote(cwd, { setUpstream: true });
        log(`[auto-commit] push ✓\n${pushOut}\n`);
      }
      if (ticket.commitMode === "commit_push_pr") {
        // gh CLI로 PR 생성 — 제목은 커밋 제목, 본문은 보고서 TL;DR
        const title = message.split("\n")[0];
        const body = prBodyFromReport(cwd, ticket.jiraKey ?? ticket.id);
        try {
          const { stdout } = await execFileAsync(
            "gh",
            ["pr", "create", "--title", title, "--body", body, "--fill"],
            { cwd, maxBuffer: 4 * 1024 * 1024 },
          );
          log(`[auto-commit] PR 생성 ✓\n${stdout}\n`);
        } catch (err) {
          const msg = (err as Error).message;
          // --fill과 --body가 충돌할 수 있음. fallback으로 --fill 없이 재시도.
          try {
            const { stdout } = await execFileAsync(
              "gh",
              ["pr", "create", "--title", title, "--body", body],
              { cwd, maxBuffer: 4 * 1024 * 1024 },
            );
            log(`[auto-commit] PR 생성 ✓ (retry)\n${stdout}\n`);
          } catch (err2) {
            log(
              `[auto-commit] PR 생성 실패: ${msg} / ${(err2 as Error).message}\n` +
                `(gh CLI 설치 + 로그인 필요: \`brew install gh && gh auth login\`)\n`,
            );
          }
        }
      }
    } catch (err) {
      log(`[auto-commit] FAILED: ${(err as Error).message}\n`);
    }
  }

  async stop(ticketId: string): Promise<boolean> {
    const child = this.processes.get(ticketId);
    if (!child) return false;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (this.processes.has(ticketId)) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }, 3000);
    return true;
  }

  /**
   * stream-json (JSONL) 청크를 받아 완전한 라인만 파싱.
   * tool_use → action running 이벤트 emit
   * tool_result → 해당 tool_use_id의 action done 이벤트 emit
   */
  private parseStreamJson(
    ticketId: string,
    chunk: string,
    actionsStream: fs.WriteStream,
  ): void {
    const prev = this.buffers.get(ticketId) ?? "";
    const combined = prev + chunk;
    const lines = combined.split("\n");
    // 마지막 라인은 불완전 가능 → 버퍼에 남김
    this.buffers.set(ticketId, lines.pop() ?? "");

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      let evt: unknown;
      try {
        evt = JSON.parse(line);
      } catch {
        continue; // 불완전/비정상 라인은 스킵
      }
      if (!evt || typeof evt !== "object") continue;
      const e = evt as {
        type?: string;
        message?: {
          content?: Array<{
            type?: string;
            id?: string;
            name?: string;
            input?: unknown;
            tool_use_id?: string;
            content?: unknown;
            is_error?: boolean;
          }>;
        };
      };

      if (e.type === "assistant" && Array.isArray(e.message?.content)) {
        for (const c of e.message!.content!) {
          if (c.type === "tool_use" && c.id && c.name) {
            const action: RunnerAction = {
              id: c.id,
              ts: new Date().toISOString(),
              name: c.name,
              summary: summarizeToolInput(c.name, c.input),
              status: "running",
            };
            actionsStream.write(JSON.stringify(action) + "\n");
            this.emit("action", ticketId, action);
          }
        }
      } else if (e.type === "user" && Array.isArray(e.message?.content)) {
        for (const c of e.message!.content!) {
          if (c.type === "tool_result" && c.tool_use_id) {
            const action: RunnerAction = {
              id: c.tool_use_id,
              ts: new Date().toISOString(),
              name: "", // 이어가기용 — UI에서 기존 running 항목을 매칭해 업데이트
              summary: "",
              status: c.is_error ? "error" : "done",
            };
            actionsStream.write(JSON.stringify(action) + "\n");
            this.emit("action", ticketId, action);
          }
        }
      }
      // type === "result" (최종), "system" (init) 등은 현재 UI에서 사용 안 함
    }
  }
}

const LOG_DIR = path.resolve(process.cwd(), "logs", "tickets");

type GlobalWithRunner = typeof globalThis & {
  __cockpitClaudeRunner?: Runner;
};
const g = globalThis as GlobalWithRunner;
export const runner: Runner = g.__cockpitClaudeRunner ?? new Runner();
if (!g.__cockpitClaudeRunner) {
  g.__cockpitClaudeRunner = runner;
  runner.setMaxListeners(0);
}
