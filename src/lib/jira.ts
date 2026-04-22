/**
 * Jira Cloud REST API 클라이언트 (서버 전용).
 * Basic auth + Setting 테이블에 저장된 자격증명 사용.
 */
import { prisma } from "./prisma";

interface JiraCredentials {
  host: string;
  email: string;
  token: string;
}

async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value;
}

export async function getJiraCredentials(): Promise<JiraCredentials | null> {
  const [host, email, token] = await Promise.all([
    getSetting("jira.host"),
    getSetting("jira.email"),
    getSetting("jira.apiToken"),
  ]);
  if (!host || !email || !token) return null;
  return { host: host.replace(/\/$/, ""), email, token };
}

export async function getAutoTransitionDone(): Promise<boolean> {
  const v = await getSetting("jira.autoTransitionDone");
  return v === "true";
}

function authHeader(c: JiraCredentials): string {
  return "Basic " + Buffer.from(`${c.email}:${c.token}`).toString("base64");
}

async function jiraFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const creds = await getJiraCredentials();
  if (!creds) throw new Error("Jira 자격증명이 설정되지 않았습니다.");
  const url = `${creds.host}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** ADF(Atlassian Document Format)의 텍스트 노드만 뽑아 plain text로 합침. */
export function renderAdfToPlainText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const stack: unknown[] = [adf];
  const out: string[] = [];
  while (stack.length > 0) {
    const node = stack.pop() as {
      type?: string;
      text?: string;
      content?: unknown[];
    };
    if (!node) continue;
    if (typeof node.text === "string") out.push(node.text);
    if (Array.isArray(node.content)) {
      // 역순으로 push하여 정방향 순회 유지
      for (let i = node.content.length - 1; i >= 0; i--) {
        stack.push(node.content[i]);
      }
    }
  }
  return out.join("").trim();
}

export async function testConnection(): Promise<{
  ok: boolean;
  user?: string;
  error?: string;
}> {
  try {
    const me = (await jiraFetch("/rest/api/3/myself")) as {
      displayName: string;
    };
    return { ok: true, user: me.displayName };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface JiraIssueLite {
  key: string;
  summary: string;
  status: string;
  type: string;
  description: string;
}

export async function searchIssues(query: string): Promise<JiraIssueLite[]> {
  const q = query.trim();
  if (!q) return [];
  const jql = /^[A-Z][A-Z0-9]+-\d+$/i.test(q)
    ? `issueKey = "${q.toUpperCase()}"`
    : `(summary ~ "${q.replace(/"/g, '\\"')}") ORDER BY updated DESC`;

  // Atlassian deprecated GET /rest/api/3/search (410 Gone).
  // Use POST /rest/api/3/search/jql instead.
  const data = (await jiraFetch(`/rest/api/3/search/jql`, {
    method: "POST",
    body: JSON.stringify({
      jql,
      maxResults: 20,
      fields: ["summary", "status", "issuetype", "description"],
    }),
  })) as {
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        status?: { name?: string };
        issuetype?: { name?: string };
        description?: unknown;
      };
    }>;
  };
  return data.issues.map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name ?? "",
    type: (i.fields.issuetype?.name ?? "feature").toLowerCase(),
    description: renderAdfToPlainText(i.fields.description),
  }));
}

/** 내 미해결 이슈 목록 조회. */
export async function getMyUnresolvedIssues(): Promise<JiraIssueLite[]> {
  // resolution = Unresolved 만으로는 부족 — 워크플로우에서 resolution을 세팅하지 않는 경우가 있음.
  // statusCategory != Done 으로 완료/종료 상태를 확실히 제외.
  const jql =
    "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
  const data = (await jiraFetch(`/rest/api/3/search/jql`, {
    method: "POST",
    body: JSON.stringify({
      jql,
      maxResults: 50,
      fields: ["summary", "status", "issuetype", "description"],
    }),
  })) as {
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        status?: { name?: string };
        issuetype?: { name?: string };
        description?: unknown;
      };
    }>;
  };
  return data.issues.map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name ?? "",
    type: (i.fields.issuetype?.name ?? "feature").toLowerCase(),
    description: renderAdfToPlainText(i.fields.description),
  }));
}

/** Jira 이슈 상태를 target으로 전환. target에 매칭되는 transition을 검색해 실행. */
async function transitionIssue(
  issueKey: string,
  target: "in_progress" | "done",
): Promise<void> {
  const wanted = target === "in_progress"
    ? ["in progress", "in-progress", "start", "doing"]
    : ["done", "closed", "resolved", "complete"];

  const data = (await jiraFetch(
    `/rest/api/3/issue/${issueKey}/transitions`,
  )) as {
    transitions: Array<{ id: string; name: string; to: { name: string } }>;
  };

  const match = data.transitions.find((t) => {
    const names = [t.name, t.to.name].map((s) => s.toLowerCase());
    return wanted.some((w) => names.some((n) => n.includes(w)));
  });
  if (!match) {
    throw new Error(
      `Jira ${issueKey}: ${target}에 해당하는 transition을 찾지 못함`,
    );
  }
  await jiraFetch(`/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  });
}

/** 자격증명이 없으면 조용히 skip, 있으면 전환 시도. */
export async function transitionIssueIfConfigured(
  issueKey: string,
  target: "in_progress" | "done",
): Promise<void> {
  const creds = await getJiraCredentials();
  if (!creds) return;
  await transitionIssue(issueKey, target);
}
