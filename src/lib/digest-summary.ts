/**
 * Digest → AI 주간 정리.
 *
 * buildDigest() 결과 + 기간 내 daily.md 본문을 컨텍스트로 모아 `claude -p` 에
 * 넘기고, 사용자 템플릿(기본: 하이라이트 / 프로젝트별 / 지표 / 다음 포커스)으로
 * 마크다운 요약을 생성한다.
 *
 * 캐시:
 *   ~/.cockpit-userdata/digest-summary/<days>d-<YYYY-MM-DD>.json
 *   같은 날, 같은 범위는 동일 캐시 반환. 사용자 재생성 시에만 덮어씀.
 *
 * 템플릿:
 *   ~/.cockpit-userdata/digest-prompt.md 가 있으면 그 내용을 지시문으로 사용.
 *   없으면 DEFAULT_PROMPT_TEMPLATE 사용.
 */
import { spawn } from "child_process";
import crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildDigest, type DigestResult } from "@/lib/digest";
import { readDailyFile } from "@/lib/daily-log";

const USERDATA_DIR = path.join(os.homedir(), ".cockpit-userdata");
const CACHE_DIR = path.join(USERDATA_DIR, "digest-summary");
const PROMPT_FILE = path.join(USERDATA_DIR, "digest-prompt.md");

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string; // ISO
}

export interface DigestSummaryResult {
  rangeDays: number;
  from: string;
  to: string;
  markdown: string;
  digest: DigestResult;
  generatedAt: string;
  cached: boolean;
  sessionId: string;
  messages: ChatMessage[];
}

function rangeLabel(days: number): string {
  if (days <= 1) return "오늘";
  if (days <= 7) return "이번 주";
  if (days <= 14) return "지난 2주";
  if (days <= 31) return "이번 달";
  return `최근 ${days}일`;
}

export const DEFAULT_PROMPT_TEMPLATE = `당신은 개발자의 회고를 돕는 리서처입니다. 아래 데이터(커밋/Claude Code 세션/daily 로그/Slack 메시지/Jira 티켓)를 바탕으로 사용자가 한 일을 한국어 마크다운으로 정리하세요.

## 출력 규칙 (엄격히)

- 아래 섹션 순서·헤딩을 그대로 사용하세요.
- 데이터에 없는 프로젝트/작업을 추측해서 만들지 마세요.
- 도구 이름(Edit/Write/MCP/Bash 등)은 언급하지 마세요.
- 프로젝트별 진행은 **커밋 또는 Claude 세션이 있는 프로젝트만** 다룹니다. 모두 나열하지 말고 활동량이 많은 프로젝트 우선.
- Slack 데이터: 본인 메시지가 5건 이상인 채널/DM 은 상대 발화까지 포함된 "양방향" 대화입니다. 그 외는 "본인만" — 답변 없이 본인 발화만 보고 주제 추론. 양방향이면 합의된 결론·결정 사항·blocker 까지 적극 반영하세요. 잡담·이모지·인사·짧은 ㅇㅋ ㄱㄱ 같은 신호는 무시.
- Jira 티켓은 "이 기간에 완료" 와 "현재 미해결(진행 중·대기 포함)" 두 그룹입니다. 미해결은 기간 무관 현재 상태 — 다음 포커스 작성에 활용.
- 각 섹션이 데이터 부족으로 의미 없으면 생략 가능. 단 "하이라이트" 와 "지표" 는 항상 출력.
- 말투: 담백한 평서형. 보고서 톤.

## 출력 형식

### 하이라이트
- (이 기간에 가장 의미 있는 성과/결정/변화를 3~5개 불릿. 각 1~2문장. 코드/문서 진행과 협업 논의·티켓 완료를 골고루 반영)

### 프로젝트별 진행

**{프로젝트명}**
- (어떤 기능/버그/문서/설계를 다뤘는지 2~4문장. 커밋 제목과 daily 로그를 근거로 작성)

(활동이 있는 프로젝트만 반복. 활동량 많은 순)

### 완료한 Jira 티켓
- {KEY} {요약} — (한 줄로 무엇을 끝냈는지)

(완료 티켓이 있을 때만. 없으면 섹션 생략)

### 협업·소통 (Slack)

**{채널명 또는 DM 상대}**
- (이 채널/DM 에서 다룬 업무 주제를 1~2문장. 잡담은 제외)

(업무성 채널/DM 만, 활동량 많은 순. Slack 데이터가 비어있으면 이 섹션 통째로 생략)

### 지표
- 커밋 {N}건 · {M}개 프로젝트
- Claude Code 세션 {N}회 · {M}개 프로젝트
- Daily 기록 {N}일
- Slack 메시지 {N}건 · {M}개 채널/DM (Slack 데이터 없으면 이 줄 생략)
- Jira 완료 {N}건 · 미해결 {M}건 (Jira 데이터 없으면 이 줄 생략)

### 다음 포커스
- (현재 미해결 Jira 티켓 + 미완료로 보이는 작업을 묶어 1~5개 불릿.
   티켓은 "{KEY} {요약}" 형태로 명시. 너무 많으면 최근 updated 우선. 없으면 이 섹션 생략)
`;

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

export function loadPromptTemplate(): {
  content: string;
  isCustom: boolean;
  path: string;
} {
  try {
    const content = fs.readFileSync(PROMPT_FILE, "utf8");
    if (content.trim()) {
      return { content, isCustom: true, path: PROMPT_FILE };
    }
  } catch {
    // missing
  }
  return { content: DEFAULT_PROMPT_TEMPLATE, isCustom: false, path: PROMPT_FILE };
}

export function savePromptTemplate(content: string): void {
  ensureDir(USERDATA_DIR);
  fs.writeFileSync(PROMPT_FILE, content, "utf8");
}

export function resetPromptTemplate(): void {
  try {
    fs.unlinkSync(PROMPT_FILE);
  } catch {
    // already missing
  }
}

function cacheKey(days: number, to: Date): string {
  const d = to.toISOString().slice(0, 10);
  return `${days}d-${d}.json`;
}

interface CacheEntry {
  rangeDays: number;
  from: string;
  to: string;
  markdown: string;
  digest: DigestResult;
  generatedAt: string;
  promptHash: string;
  sessionId: string;
  messages: ChatMessage[];
}

function hashPrompt(s: string): string {
  // 약식 해시 — 프롬프트가 바뀌면 캐시를 무효화하기 위함
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function readCache(key: string): CacheEntry | null {
  try {
    const raw = fs.readFileSync(path.join(CACHE_DIR, key), "utf8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  try {
    ensureDir(CACHE_DIR);
    fs.writeFileSync(path.join(CACHE_DIR, key), JSON.stringify(entry, null, 2), "utf8");
  } catch {
    // ignore cache write failure
  }
}

function buildContext(digest: DigestResult): string {
  const parts: string[] = [];

  parts.push(`## 기간: ${digest.from.slice(0, 10)} ~ ${digest.to.slice(0, 10)} (${digest.rangeDays}일)`);
  parts.push(`git email: ${digest.gitEmail ?? "(미설정)"}`);
  parts.push("");

  // 커밋
  parts.push(`## 프로젝트별 커밋 (총 ${digest.totalCommits}건)`);
  if (digest.commitsByProject.length === 0) {
    parts.push("(없음)");
  } else {
    for (const p of digest.commitsByProject) {
      parts.push(`\n### ${p.projectName} (${p.commits.length}건)`);
      const commits = p.commits.slice(0, 30);
      for (const c of commits) {
        parts.push(`- ${c.date.slice(0, 10)} ${c.subject}`);
      }
      if (p.commits.length > 30) {
        parts.push(`  ... (외 ${p.commits.length - 30}건)`);
      }
    }
  }
  parts.push("");

  // Claude 세션 분포
  parts.push(`## Claude Code 세션 분포 (총 ${digest.sessionCount}회)`);
  if (digest.sessionsByProject.length === 0) {
    parts.push("(없음)");
  } else {
    for (const s of digest.sessionsByProject) {
      parts.push(`- ${s.projectName}: ${s.count}회`);
    }
  }
  parts.push("");

  // Daily 로그 본문 (최근 10일까지만)
  parts.push(`## Daily 로그 (${digest.dailyDates.length}일)`);
  if (digest.dailyDates.length === 0) {
    parts.push("(없음)");
  } else {
    const sample = digest.dailyDates.slice(0, 10);
    for (const date of sample) {
      const content = readDailyFile(date);
      if (!content) continue;
      parts.push(`\n### ${date}`);
      const body = content.replace(/^#\s+\d{4}-\d{2}-\d{2}\s*\n+/, "").slice(0, 2000);
      parts.push(body);
    }
    if (digest.dailyDates.length > 10) {
      parts.push(`\n(외 ${digest.dailyDates.length - 10}일 더 있음 — 생략)`);
    }
  }
  parts.push("");

  // Jira — 완료(in range) + 진행중(현재)
  const jira = digest.jira;
  parts.push(
    `## Jira 티켓 (완료 ${jira.done.length}건, 미해결 ${jira.inProgress.length}건${
      jira.available ? "" : " — unavailable"
    })`,
  );
  if (!jira.available) {
    parts.push(`(Jira 자격증명 미설정 또는 조회 실패: ${jira.reason ?? "unknown"})`);
  } else {
    const TRUNC = 200;
    const fmt = (i: { key: string; summary: string; status: string; description?: string; updated: string }) => {
      const desc = (i.description || "").replace(/\s+/g, " ").trim();
      const descPart = desc ? ` — ${desc.length > TRUNC ? desc.slice(0, TRUNC - 1) + "…" : desc}` : "";
      const updated = i.updated ? ` (updated ${i.updated.slice(0, 10)})` : "";
      return `- ${i.key} [${i.status}] ${i.summary}${updated}${descPart}`;
    };
    parts.push(`\n### 완료한 티켓 (${jira.done.length})`);
    if (jira.done.length === 0) parts.push("(없음)");
    else for (const i of jira.done.slice(0, 30)) parts.push(fmt(i));

    parts.push(`\n### 현재 미해결 티켓 (${jira.inProgress.length})`);
    if (jira.inProgress.length === 0) parts.push("(없음)");
    else for (const i of jira.inProgress.slice(0, 30)) parts.push(fmt(i));
  }
  parts.push("");

  // Slack — 채널/DM별. 본인 메시지가 5건 이상인 채널은 상대 발화도 함께 (양방향).
  const slack = digest.slack;
  parts.push(
    `## Slack 활동 (총 ${slack.totalMessages}건, ${slack.channels.length}개 채널/DM${
      slack.available ? "" : " — unavailable"
    })`,
  );
  if (!slack.available) {
    parts.push(`(Slack 토큰 미설정 또는 조회 실패: ${slack.reason ?? "unknown"})`);
  } else if (slack.totalMessages === 0) {
    parts.push("(없음)");
  } else {
    // 채널 cap — 너무 많으면 컨텍스트 폭발. 상위 12개 채널/DM, 채널당 40메시지.
    const MAX_CHANNELS = 12;
    const MAX_MSGS_PER_CHANNEL = 40;
    const shown = slack.channels.slice(0, MAX_CHANNELS);
    for (const ch of shown) {
      const ctxNote = ch.hasFullContext ? "양방향" : "본인만";
      parts.push(`\n### ${ch.label} (${ch.messages.length}건, ${ctxNote})`);
      const msgs = ch.messages.slice(0, MAX_MSGS_PER_CHANNEL);
      for (const m of msgs) {
        const t = m.text.replace(/\s+/g, " ").trim();
        if (!t) continue;
        const truncated = t.length > 200 ? t.slice(0, 197) + "…" : t;
        parts.push(
          `- [${m.isoAt.slice(0, 16).replace("T", " ")}] ${m.author}: ${truncated}`,
        );
      }
      if (ch.messages.length > MAX_MSGS_PER_CHANNEL) {
        parts.push(`  … (외 ${ch.messages.length - MAX_MSGS_PER_CHANNEL}건 생략)`);
      }
    }
    if (slack.channels.length > MAX_CHANNELS) {
      parts.push(
        `\n(외 ${slack.channels.length - MAX_CHANNELS}개 채널/DM 생략)`,
      );
    }
  }

  return parts.join("\n");
}

interface ClaudeOptions {
  sessionId?: string;
  resume?: string;
}

function invokeClaude(prompt: string, opts: ClaudeOptions = {}): Promise<string> {
  const args = ["-p", "--output-format", "text"];
  if (opts.resume) args.push("--resume", opts.resume);
  else if (opts.sessionId) args.push("--session-id", opts.sessionId);

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const MAX_OUT = 4 * 1024 * 1024;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < MAX_OUT) stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < MAX_OUT) stderr += chunk;
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("claude CLI 타임아웃 (300s)"));
    }, 300_000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            `claude exit ${code}: ${stderr.trim().slice(0, 500) || "(no stderr)"}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.write(prompt, "utf8");
    child.stdin.end();
  });
}

export interface BuildOptions {
  /** true면 캐시 무시하고 재생성 */
  refresh?: boolean;
}

function entryToResult(
  entry: CacheEntry,
  cached: boolean,
): DigestSummaryResult {
  return {
    rangeDays: entry.rangeDays,
    from: entry.from,
    to: entry.to,
    markdown: entry.markdown,
    digest: entry.digest,
    generatedAt: entry.generatedAt,
    cached,
    sessionId: entry.sessionId,
    messages: entry.messages ?? [],
  };
}

/** 캐시만 조회 (없으면 null). 생성은 안 함. */
export function peekDigestSummaryCache(days: number): DigestSummaryResult | null {
  const now = new Date();
  const key = cacheKey(days, now);
  const entry = readCache(key);
  if (!entry) return null;
  // 프롬프트가 바뀐 경우 스테일 처리
  const tpl = loadPromptTemplate();
  if (entry.promptHash !== hashPrompt(tpl.content)) return null;
  // 과거 버전 캐시 호환 — sessionId 없으면 무시
  if (!entry.sessionId) return null;
  return entryToResult(entry, true);
}

export async function buildDigestSummary(
  days: number,
  opts: BuildOptions = {},
): Promise<DigestSummaryResult> {
  if (!opts.refresh) {
    const cached = peekDigestSummaryCache(days);
    if (cached) return cached;
  }

  const digest = await buildDigest(days);
  const tpl = loadPromptTemplate();

  const label = rangeLabel(days);
  const intro = `아래 데이터는 "${label}(${digest.from.slice(0, 10)} ~ ${digest.to.slice(0, 10)})" 동안의 활동입니다.\n`;
  const context = buildContext(digest);
  const prompt = intro + "\n" + tpl.content + "\n---\n데이터:\n" + context;

  // 새 세션 생성 — 후속 대화를 --resume 으로 이어갈 수 있게
  const sessionId = crypto.randomUUID();

  let markdown: string;
  try {
    markdown = await invokeClaude(prompt, { sessionId });
  } catch (err) {
    throw new Error(
      `claude CLI 호출 실패: ${(err as Error).message}. (claude 가 PATH 에 있는지 확인)`,
    );
  }

  if (!markdown) {
    throw new Error("AI 응답이 비어있음");
  }

  const entry: CacheEntry = {
    rangeDays: days,
    from: digest.from,
    to: digest.to,
    markdown,
    digest,
    generatedAt: new Date().toISOString(),
    promptHash: hashPrompt(tpl.content),
    sessionId,
    messages: [],
  };

  const now = new Date();
  writeCache(cacheKey(days, now), entry);

  return entryToResult(entry, false);
}

/**
 * 캐시된 summary 의 Claude 세션에 후속 메시지를 보낸다.
 * --resume 으로 컨텍스트(초기 summary 프롬프트 + 응답 + 이전 후속 대화)를 이어감.
 */
export async function chatWithDigest(
  days: number,
  userMessage: string,
): Promise<DigestSummaryResult> {
  const msg = userMessage.trim();
  if (!msg) throw new Error("메시지가 비어있음");

  const now = new Date();
  const key = cacheKey(days, now);
  const entry = readCache(key);
  if (!entry || !entry.sessionId) {
    throw new Error(
      "이어갈 세션이 없음 — 먼저 AI 정리를 생성하세요.",
    );
  }

  let reply: string;
  try {
    reply = await invokeClaude(msg, { resume: entry.sessionId });
  } catch (err) {
    throw new Error(
      `claude --resume 호출 실패: ${(err as Error).message}`,
    );
  }
  if (!reply) throw new Error("AI 응답이 비어있음");

  const nowIso = new Date().toISOString();
  const messages: ChatMessage[] = [
    ...(entry.messages ?? []),
    { role: "user", content: msg, at: nowIso },
    { role: "assistant", content: reply, at: new Date().toISOString() },
  ];

  const next: CacheEntry = { ...entry, messages };
  writeCache(key, next);
  return entryToResult(next, true);
}
