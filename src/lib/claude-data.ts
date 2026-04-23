/**
 * Claude Code 로컬 데이터 리더.
 * ~/.claude/projects/<encoded-dir>/<session-id>.jsonl 에서 세션·토큰 정보를 추출한다.
 *
 * encoded-dir 규칙: 절대경로의 '/' 를 '-' 로 치환한 형태.
 *   예) /Users/foo/bar → -Users-foo-bar
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

export interface SessionSummary {
  id: string;
  projectDir: string; // 디코드된 절대경로 (ex: /Users/foo/bar)
  projectName: string; // 경로 basename
  filePath: string;
  mtime: number; // ms
  firstTs: string | null; // ISO
  lastTs: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  firstUserText: string | null; // 제목 힌트
  tokens: TokenAggregate;
}

export interface TokenAggregate {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
}

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  scope?: string; // user | project | local
  status?: "connected" | "disconnected" | "needs_auth" | "unknown";
  statusDetail?: string;
}

function decodeProjectDir(encoded: string): string {
  // -Users-foo-bar → /Users/foo/bar
  return "/" + encoded.replace(/^-+/, "").split("-").join("/");
}

function safeReadLines(filePath: string): string[] {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function extractFirstUserText(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const msg = (obj as { message?: unknown }).message;
  if (!msg || typeof msg !== "object") return null;
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content.slice(0, 200);
  if (Array.isArray(content)) {
    for (const c of content) {
      if (typeof c === "string") return c.slice(0, 200);
      if (c && typeof c === "object") {
        const rec = c as { type?: string; text?: string };
        if (rec.type === "text" && typeof rec.text === "string")
          return rec.text.slice(0, 200);
      }
    }
  }
  return null;
}

function aggregateTokensFromUsage(u: unknown, agg: TokenAggregate): void {
  if (!u || typeof u !== "object") return;
  const rec = u as Record<string, unknown>;
  const n = (v: unknown): number => (typeof v === "number" ? v : 0);
  agg.input += n(rec.input_tokens);
  agg.output += n(rec.output_tokens);
  agg.cacheCreate += n(rec.cache_creation_input_tokens);
  agg.cacheRead += n(rec.cache_read_input_tokens);
}

/** 단일 .jsonl 세션 파일을 읽어 요약 생성 */
export function summarizeSession(filePath: string): SessionSummary | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const lines = safeReadLines(filePath);
  if (lines.length === 0) return null;

  const id = path.basename(filePath, ".jsonl");
  const encodedDir = path.basename(path.dirname(filePath));
  const projectDir = decodeProjectDir(encodedDir);
  const projectName = path.basename(projectDir) || projectDir;

  const tokens: TokenAggregate = {
    input: 0,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
    total: 0,
  };

  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let userCount = 0;
  let assistantCount = 0;
  let firstUserText: string | null = null;

  for (const line of lines) {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = obj as Record<string, unknown>;
    const t = rec.type;
    const ts = rec.timestamp;
    if (typeof ts === "string") {
      if (!firstTs) firstTs = ts;
      lastTs = ts;
    }
    if (t === "user") {
      userCount++;
      if (!firstUserText) firstUserText = extractFirstUserText(rec);
    } else if (t === "assistant") {
      assistantCount++;
      const msg = rec.message;
      if (msg && typeof msg === "object") {
        const usage = (msg as { usage?: unknown }).usage;
        if (usage) aggregateTokensFromUsage(usage, tokens);
      }
    }
  }
  tokens.total =
    tokens.input + tokens.output + tokens.cacheCreate + tokens.cacheRead;

  return {
    id,
    projectDir,
    projectName,
    filePath,
    mtime: stat.mtimeMs,
    firstTs,
    lastTs,
    messageCount: userCount + assistantCount,
    userMessageCount: userCount,
    assistantMessageCount: assistantCount,
    firstUserText,
    tokens,
  };
}

/** 전체 세션 스캔 — mtime 역순 */
export function listSessions(limit = 100): SessionSummary[] {
  const results: SessionSummary[] = [];
  let projectDirs: string[] = [];
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return [];
  }
  for (const dirName of projectDirs) {
    const dirPath = path.join(CLAUDE_PROJECTS_DIR, dirName);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl")) continue;
      const full = path.join(dirPath, file);
      const summary = summarizeSession(full);
      if (summary) results.push(summary);
    }
  }
  results.sort((a, b) => b.mtime - a.mtime);
  return results.slice(0, limit);
}

/** 최근 N일 사용량 집계 — daily token trend */
export function aggregateUsageByDay(days = 30): Array<{
  date: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  sessions: number;
}> {
  const cutoff = Date.now() - days * 86400_000;
  const sessions = listSessions(5000).filter((s) => s.mtime >= cutoff);
  const byDay = new Map<
    string,
    {
      date: string;
      input: number;
      output: number;
      cacheCreate: number;
      cacheRead: number;
      total: number;
      sessions: number;
    }
  >();
  for (const s of sessions) {
    const d = s.lastTs ? s.lastTs.slice(0, 10) : new Date(s.mtime).toISOString().slice(0, 10);
    const row =
      byDay.get(d) ??
      {
        date: d,
        input: 0,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        total: 0,
        sessions: 0,
      };
    row.input += s.tokens.input;
    row.output += s.tokens.output;
    row.cacheCreate += s.tokens.cacheCreate;
    row.cacheRead += s.tokens.cacheRead;
    row.total += s.tokens.total;
    row.sessions += 1;
    byDay.set(d, row);
  }
  return Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * `claude mcp list` 쉘 호출로 MCP 서버 목록 파악.
 * claude CLI 없으면 빈 배열.
 *
 * 출력 포맷(대략):
 *   cockpit: tsx /path/to/server.ts - ✓ Connected
 *   other: npx some-pkg - ✗ Disconnected
 */
export async function listMcpServers(): Promise<McpServer[]> {
  try {
    const { stdout } = await execFileP("claude", ["mcp", "list"], {
      timeout: 5000,
      env: process.env,
    });
    return parseMcpList(stdout);
  } catch {
    return [];
  }
}

function parseMcpList(output: string): McpServer[] {
  const servers: McpServer[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("Checking")) continue;
    // 예: "cockpit: /path/to/tsx /path/to/server.ts - ✓ Connected"
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (!name) continue;
    // 상태 판별 + detail
    let status: McpServer["status"] = "unknown";
    let statusDetail: string | undefined;
    // "- " 이후가 상태 문구
    const dashIdx = rest.lastIndexOf(" - ");
    const statusText = dashIdx > 0 ? rest.slice(dashIdx + 3).trim() : "";
    if (/Needs authentication/i.test(statusText)) {
      status = "needs_auth";
      statusDetail = statusText.replace(/^[!✗✓\s]+/, "").trim();
    } else if (/✓|Connected/i.test(statusText)) {
      status = "connected";
      statusDetail = statusText.replace(/^[!✗✓\s]+/, "").trim();
    } else if (/✗|Failed|Disconnected/i.test(statusText)) {
      status = "disconnected";
      statusDetail = statusText.replace(/^[!✗✓\s]+/, "").trim();
    } else if (statusText) {
      statusDetail = statusText;
    }
    const cmdLine = dashIdx > 0 ? rest.slice(0, dashIdx).trim() : rest;
    const parts = cmdLine.split(/\s+/);
    const command = parts[0] ?? "";
    const args = parts.slice(1);
    servers.push({ name, command, args, status, statusDetail });
  }
  return servers;
}
