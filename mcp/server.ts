/**
 * Cockpit MCP Server
 * ─────────────────────
 * Claude Code(혹은 다른 MCP 클라이언트)에서 Cockpit의 메모/티켓/데일리 로그를
 * 네이티브 도구처럼 쓰게 해주는 stdio 전송 MCP 서버.
 *
 * 실행:  tsx /path/to/cockpit/mcp/server.ts
 * 환경변수:
 *   COCKPIT_URL    base URL (기본: http://127.0.0.1:<last-port>  → 8282)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── Base URL 해석 ──────────────────────────────────────────────
function resolveBaseUrl(): string {
  if (process.env.COCKPIT_URL) return process.env.COCKPIT_URL.replace(/\/$/, "");
  try {
    const port = fs
      .readFileSync(
        path.join(os.homedir(), ".cockpit-userdata", "last-port"),
        "utf8",
      )
      .trim();
    if (/^\d+$/.test(port)) return `http://127.0.0.1:${port}`;
  } catch {
    // ignore
  }
  return "http://127.0.0.1:8282";
}

const BASE_URL = resolveBaseUrl();

// ─── HTTP 래퍼 ──────────────────────────────────────────────────
async function api<T = unknown>(
  route: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${route}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Cockpit API 실패 (${res.status} ${res.statusText}) ${route}: ${text || "(no body)"}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function okJson(obj: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }],
  };
}

// ─── MCP 서버 ──────────────────────────────────────────────────
const server = new McpServer(
  { name: "cockpit", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// ─── Memo ──────────────────────────────────────────────────────
server.registerTool(
  "memo_create",
  {
    description:
      "Cockpit 에 새 메모 작성. TODO/아이디어/짧은 기록용. 기본은 전역 메모, projectId 주면 해당 프로젝트로 귀속. 서버가 자동으로 daily.md 에도 한 줄 기록.",
    inputSchema: {
      title: z.string().describe("메모 제목 (필수)"),
      content: z.string().optional().describe("마크다운 본문"),
      tags: z.string().optional().describe("콤마 구분 태그 (예: '아이디어,버그')"),
      projectId: z
        .string()
        .optional()
        .describe(
          "특정 프로젝트 id. 생략 시 전역 메모. project_list 로 id 조회 가능",
        ),
    },
  },
  async ({ title, content, tags, projectId }) => {
    const memo = await api<{ id: string; title: string }>("/api/memos", {
      method: "POST",
      body: JSON.stringify({
        title,
        content: content ?? "",
        tags: tags ?? "",
        projectId: projectId ?? null,
      }),
    });
    return ok(`메모 작성됨: "${memo.title}" (id=${memo.id})`);
  },
);

server.registerTool(
  "memo_list",
  {
    description:
      "메모 목록 조회. projectId 로 필터 가능 ('__global__' = 전역만, 생략 = 전체).",
    inputSchema: {
      projectId: z
        .string()
        .optional()
        .describe("프로젝트 id / '__global__' / 생략(전체)"),
      archived: z
        .boolean()
        .optional()
        .describe("true 면 보관된 메모 포함"),
    },
  },
  async ({ projectId, archived }) => {
    const qs = new URLSearchParams();
    if (projectId === "__global__") qs.set("projectId", "null");
    else if (projectId) qs.set("projectId", projectId);
    if (archived) qs.set("archived", "1");
    const q = qs.toString();
    const data = await api<{ memos: unknown[] }>(
      `/api/memos${q ? `?${q}` : ""}`,
    );
    return okJson(data);
  },
);

server.registerTool(
  "memo_complete",
  {
    description: "메모를 TODO 완료로 체크. 오늘 한 일로 daily.md 에 기록됨.",
    inputSchema: {
      id: z.string().describe("memo id"),
      completed: z
        .boolean()
        .optional()
        .describe("기본 true. false 로 주면 완료 취소"),
    },
  },
  async ({ id, completed }) => {
    await api(`/api/memos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: completed ?? true }),
    });
    return ok(`memo ${id} → ${completed === false ? "미완료" : "완료"}`);
  },
);

server.registerTool(
  "memo_update",
  {
    description: "메모 내용 수정 (title/content/tags 선택). 없는 필드는 변경 안 됨.",
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      tags: z.string().optional(),
      archived: z.boolean().optional(),
      pinned: z.boolean().optional(),
    },
  },
  async ({ id, ...patch }) => {
    await api(`/api/memos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return ok(`memo ${id} 갱신됨`);
  },
);

// ─── Ticket ────────────────────────────────────────────────────
server.registerTool(
  "ticket_create",
  {
    description:
      "새 티켓 생성 (projectId 필수). PDCA 자동 적용, 생성 시 daily.md 기록.",
    inputSchema: {
      projectId: z.string().describe("프로젝트 id (필수)"),
      title: z.string().describe("티켓 제목"),
      description: z.string().optional(),
      type: z
        .enum(["feature", "bug", "chore", "refactor", "docs"])
        .optional(),
      successCriteria: z.string().optional(),
      priority: z.number().int().optional(),
      jiraKey: z.string().optional(),
    },
  },
  async (args) => {
    const t = await api<{ id: string; title: string }>("/api/tickets", {
      method: "POST",
      body: JSON.stringify(args),
    });
    return ok(`티켓 생성: "${t.title}" (id=${t.id})`);
  },
);

server.registerTool(
  "ticket_list",
  {
    description: "티켓 목록. projectId 로 필터 가능.",
    inputSchema: {
      projectId: z.string().optional(),
    },
  },
  async ({ projectId }) => {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const data = await api<{ tickets: unknown[] }>(`/api/tickets${qs}`);
    return okJson(data);
  },
);

server.registerTool(
  "ticket_update",
  {
    description:
      "티켓 상태/내용 수정. status='done' 이면 완료 처리 — resultSummary 가 daily.md 에 요약으로 포함됨.",
    inputSchema: {
      id: z.string(),
      status: z
        .enum(["backlog", "todo", "in_progress", "in_review", "done"])
        .optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      resultSummary: z.string().optional(),
      jiraKey: z.string().optional(),
    },
  },
  async ({ id, ...patch }) => {
    await api(`/api/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return ok(`ticket ${id} 갱신됨`);
  },
);

server.registerTool(
  "ticket_rework",
  {
    description: "티켓을 rework(재작업) 상태로 되돌림. 사유 포함.",
    inputSchema: {
      id: z.string(),
      reason: z.string().optional(),
    },
  },
  async ({ id, reason }) => {
    await api(`/api/tickets/${id}/rework`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return ok(`ticket ${id} rework`);
  },
);

// ─── Project ───────────────────────────────────────────────────
server.registerTool(
  "project_list",
  {
    description:
      "Cockpit 에 등록된 프로젝트 목록. 메모/티켓 생성 시 projectId 얻는 용도.",
    inputSchema: {},
  },
  async () => {
    const data = await api<{ projects: unknown[] }>("/api/projects");
    return okJson(data);
  },
);

// ─── Daily Log ─────────────────────────────────────────────────
server.registerTool(
  "daily_read",
  {
    description:
      "특정 날짜의 daily.md 본문 반환. date 생략 시 오늘. 형식: YYYY-MM-DD.",
    inputSchema: {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD (미지정 시 오늘)"),
    },
  },
  async ({ date }) => {
    const qs = date ? `?date=${date}` : "";
    const data = await api<{ date: string; content: string | null }>(
      `/api/insights/daily${qs}`,
    );
    if (!data.content) return ok(`(${data.date} 기록 없음)`);
    return ok(data.content);
  },
);

server.registerTool(
  "daily_list",
  {
    description: "기록이 있는 최근 N일 날짜 목록.",
    inputSchema: {
      limit: z.number().int().positive().optional().describe("기본 30"),
    },
  },
  async ({ limit }) => {
    const data = await api<{ dates: string[] }>(`/api/insights/daily`);
    const sliced = data.dates.slice(0, limit ?? 30);
    return okJson(sliced);
  },
);

server.registerTool(
  "daily_log_activity",
  {
    description:
      "오늘자 daily.md 에 '자유 형식 작업 기록' 한 줄 추가. 의미 있는 코드 변경·조사·결정 단위로 1회 호출하는 것을 권장. 너무 잘게 쪼개지 말 것.",
    inputSchema: {
      title: z.string().describe("짧은 한 줄 요약 (필수)"),
      details: z.string().optional().describe("1~2문장 상세 (선택)"),
      projectName: z
        .string()
        .optional()
        .describe("현재 작업한 프로젝트 이름 (선택, 라벨용)"),
      tags: z.string().optional().describe("콤마 구분 태그"),
    },
  },
  async (args) => {
    await api("/api/insights/daily", {
      method: "POST",
      body: JSON.stringify(args),
    });
    return ok(`daily.md 에 기록됨: ${args.title}`);
  },
);

// ─── Main ──────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr 로만 부팅 로그 (stdout 은 MCP 프로토콜 전용)
  console.error(`[cockpit-mcp] connected. base=${BASE_URL}`);
}

main().catch((err) => {
  console.error("[cockpit-mcp] fatal:", err);
  process.exit(1);
});
