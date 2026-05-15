/**
 * Slack Web API 클라이언트 (서버 전용).
 * Setting 테이블의 slack.userToken (xoxp-...) 사용.
 */
import { prisma } from "./prisma";

async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value;
}

export async function getSlackUserToken(): Promise<string | null> {
  const token = await getSetting("slack.userToken");
  return token?.trim() || null;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

async function slackFetch<T extends SlackResponse>(
  method: string,
  params: Record<string, string> = {},
): Promise<T> {
  const token = await getSlackUserToken();
  if (!token) throw new Error("Slack user token이 설정되지 않았습니다.");
  const url = `https://slack.com/api/${method}`;
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Slack HTTP ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as T;
  if (!json.ok) throw new Error(`Slack ${method}: ${json.error ?? "unknown"}`);
  return json;
}

export async function testConnection(): Promise<{
  ok: boolean;
  user?: string;
  team?: string;
  error?: string;
}> {
  try {
    const me = await slackFetch<
      SlackResponse & { user?: string; team?: string }
    >("auth.test");
    return { ok: true, user: me.user, team: me.team };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
