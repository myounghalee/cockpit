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

/* ───────────────────────────────────────────────────────────────────
 * Digest 통합 — 기간 내 본인 메시지 수집 + 채널/DM 라벨링.
 *   - search.messages 로 from:@<me> after:<from> 검색 (페이지 cap)
 *   - DM/채널 ID 로 그룹핑, DM 상대 user.info 조회
 *   - 봇 DM (자동화 알림) 은 기본적으로 제외
 *   - 메시지 텍스트의 <@U…> 멘션을 사람 이름으로 치환
 * ─────────────────────────────────────────────────────────────────── */

const SEARCH_PAGE_SIZE = 100;
const MAX_PAGES = 5; // 최대 500개 메시지

interface SearchMatch {
  ts: string;
  text?: string;
  permalink?: string;
  channel?: { id?: string; name?: string };
}

interface SlackUserLite {
  id: string;
  realName: string;
  isBot: boolean;
}

export interface SlackDigestMessage {
  isoAt: string;
  /** 작성자 표시 이름. "나" / 상대방 / 봇 이름 */
  author: string;
  /** 본인이 보낸 메시지 여부 */
  isMe: boolean;
  text: string;
  /** search.messages 결과로 들어온 메시지에만 있음. history-only 메시지는 없음. */
  permalink?: string;
}

export interface SlackDigestChannel {
  id: string;
  label: string;
  kind: "public" | "private" | "dm" | "group_dm" | "unknown";
  partnerIsBot: boolean;
  /** true면 conversations.history 로 상대 메시지까지 합쳐 가져온 채널 */
  hasFullContext: boolean;
  messages: SlackDigestMessage[];
}

export interface SlackDigest {
  available: boolean;
  reason?: string;
  myUserId: string | null;
  myDisplayName: string | null;
  team: string | null;
  totalMessages: number;
  channels: SlackDigestChannel[];
  fetchedAt: string;
}

function toIsoKst(unixSecStr: string): string {
  const sec = Number(unixSecStr.split(".")[0]);
  return new Date(sec * 1000).toISOString();
}

function dayString(d: Date): string {
  // YYYY-MM-DD (UTC 기준 — Slack search 의 after: 는 워크스페이스 타임존 일자.
  // 정밀도가 일 단위라 UTC 로도 충분 — 경계가 +-1일 차이날 수 있으나 디지스트엔
  // 실용상 영향 없음.)
  return d.toISOString().slice(0, 10);
}

async function resolveUsersBatch(
  ids: string[],
): Promise<Map<string, SlackUserLite>> {
  const out = new Map<string, SlackUserLite>();
  // 병렬 호출 — users.info 는 Tier 4 (100 req/min)
  await Promise.all(
    Array.from(new Set(ids))
      .filter((id) => id && id.startsWith("U"))
      .map(async (id) => {
        try {
          const r = await slackFetch<
            SlackResponse & {
              user?: {
                id?: string;
                real_name?: string;
                name?: string;
                is_bot?: boolean;
              };
            }
          >("users.info", { user: id });
          const u = r.user;
          out.set(id, {
            id,
            realName: u?.real_name || u?.name || id,
            isBot: !!u?.is_bot,
          });
        } catch {
          out.set(id, { id, realName: id, isBot: false });
        }
      }),
  );
  return out;
}

function classifyChannel(cid: string): SlackDigestChannel["kind"] {
  if (cid.startsWith("C")) return "public";
  if (cid.startsWith("G")) return "private";
  if (cid.startsWith("D")) return "dm";
  // 그룹DM 은 보통 G 로 시작 (mpdm-...) — 별도 구분 어려움
  return "unknown";
}

function resolveMentions(
  text: string,
  users: Map<string, SlackUserLite>,
): string {
  return text.replace(/<@(U[A-Z0-9]+)(?:\|[^>]+)?>/g, (_m, uid: string) => {
    const u = users.get(uid);
    return "@" + (u?.realName ?? uid);
  });
}

export interface SlackDigestOptions {
  /** 봇과의 DM 채널을 결과에 포함할지 (기본: 제외 — 자동화 알림 노이즈) */
  includeBotDms?: boolean;
}

/**
 * 디지스트용 Slack 활동 수집.
 * 토큰 미설정/실패 시 throw 하지 않고 { available: false, reason } 반환.
 */
export async function buildSlackDigest(
  days: number,
  opts: SlackDigestOptions = {},
): Promise<SlackDigest> {
  const fetchedAt = new Date().toISOString();
  const empty = (reason: string): SlackDigest => ({
    available: false,
    reason,
    myUserId: null,
    myDisplayName: null,
    team: null,
    totalMessages: 0,
    channels: [],
    fetchedAt,
  });

  const token = await getSlackUserToken();
  if (!token) return empty("token missing");

  let me: SlackResponse & { user?: string; team?: string; user_id?: string };
  try {
    me = await slackFetch<
      SlackResponse & { user?: string; team?: string; user_id?: string }
    >("auth.test");
  } catch (err) {
    return empty(`auth.test 실패: ${(err as Error).message}`);
  }
  const myUserId = me.user_id ?? null;
  const myDisplayName = me.user ?? null;
  const team = me.team ?? null;
  if (!myDisplayName) return empty("auth.test 응답에 user(handle) 없음");

  // 기간 — days 일 전부터 오늘까지. search 의 after: 는 strict 이라 -1일 보정.
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const afterDay = new Date(from.getTime() - 86400_000);
  const query = `from:@${myDisplayName} after:${dayString(afterDay)}`;

  const matches: SearchMatch[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let r: SlackResponse & {
      messages?: {
        matches?: SearchMatch[];
        paging?: { page?: number; pages?: number };
        total?: number;
      };
    };
    try {
      r = await slackFetch<typeof r>("search.messages", {
        query,
        count: String(SEARCH_PAGE_SIZE),
        page: String(page),
        sort: "timestamp",
        sort_dir: "asc",
      });
    } catch (err) {
      return empty(`search.messages 실패: ${(err as Error).message}`);
    }
    const m = r.messages ?? {};
    const arr = m.matches ?? [];
    matches.push(...arr);
    const paging = m.paging ?? {};
    if ((paging.page ?? 1) >= (paging.pages ?? 1)) break;
  }

  // 채널별 그룹
  type ChannelBucket = {
    id: string;
    name: string;
    kind: SlackDigestChannel["kind"];
    matches: SearchMatch[];
  };
  const buckets = new Map<string, ChannelBucket>();
  for (const msg of matches) {
    const ch = msg.channel ?? {};
    const cid = ch.id ?? "?";
    const cname = ch.name ?? "";
    const cur = buckets.get(cid);
    if (cur) cur.matches.push(msg);
    else
      buckets.set(cid, {
        id: cid,
        name: cname,
        kind: classifyChannel(cid),
        matches: [msg],
      });
  }

  // DM 의 channel.name 은 상대 user id (U…) — 사용자 정보 조회 대상
  const userIdsToResolve: string[] = [];
  for (const b of buckets.values()) {
    if (b.kind === "dm" && b.name && b.name.startsWith("U")) {
      userIdsToResolve.push(b.name);
    }
    // 메시지 본문의 멘션 ID 도 미리 모아두면 호출 1회로 끝
    for (const m of b.matches) {
      const t = m.text ?? "";
      const re = /<@(U[A-Z0-9]+)(?:\|[^>]+)?>/g;
      let mt: RegExpExecArray | null;
      while ((mt = re.exec(t)) !== null) userIdsToResolve.push(mt[1]);
    }
  }
  const users = await resolveUsersBatch(userIdsToResolve);

  // 1차 통과 — 봇 DM 필터링 후 어느 채널이 history 호출 대상인지 결정
  type EnrichedBucket = {
    bucket: ChannelBucket;
    label: string;
    partnerIsBot: boolean;
  };
  const labelOf = (b: ChannelBucket): { label: string; partnerIsBot: boolean } => {
    if (b.kind === "dm") {
      const partnerId = b.name;
      const partner = users.get(partnerId);
      return {
        label: `DM ↔ ${partner?.realName ?? partnerId}`,
        partnerIsBot: !!partner?.isBot,
      };
    }
    if (b.kind === "private") return { label: `private #${b.name || b.id}`, partnerIsBot: false };
    if (b.kind === "public") return { label: `#${b.name || b.id}`, partnerIsBot: false };
    return { label: b.name || b.id, partnerIsBot: false };
  };

  const enriched: EnrichedBucket[] = Array.from(buckets.values())
    .map((bucket) => ({ bucket, ...labelOf(bucket) }))
    .filter((e) => opts.includeBotDms || !e.partnerIsBot)
    .sort((a, z) => z.bucket.matches.length - a.bucket.matches.length);

  // ≥5 본인 메시지인 채널만 conversations.history 로 상대 발화까지 가져옴.
  const HISTORY_THRESHOLD = 5;
  const HISTORY_LIMIT = 200;
  const oldestUnix = Math.floor(from.getTime() / 1000).toString();
  const latestUnix = Math.floor(to.getTime() / 1000).toString();

  interface HistoryMsg {
    ts: string;
    text?: string;
    user?: string;
    subtype?: string;
    bot_id?: string;
    bot_profile?: { name?: string };
  }
  const histories = new Map<string, HistoryMsg[]>();
  const eligibleForHistory = enriched.filter(
    (e) => e.bucket.matches.length >= HISTORY_THRESHOLD,
  );
  await Promise.all(
    eligibleForHistory.map(async (e) => {
      try {
        const r = await slackFetch<
          SlackResponse & { messages?: HistoryMsg[] }
        >("conversations.history", {
          channel: e.bucket.id,
          oldest: oldestUnix,
          latest: latestUnix,
          limit: String(HISTORY_LIMIT),
          inclusive: "true",
        });
        // history 는 newest-first → 시간순 정렬을 위해 뒤집음
        histories.set(e.bucket.id, (r.messages ?? []).slice().reverse());
      } catch {
        // 권한 부족 (groups:history 등) 또는 채널 접근 안 됨 — search-only 로 fallback
      }
    }),
  );

  // 2차 user 해소 — history 메시지 작성자 + history 텍스트의 멘션
  const moreUserIds: string[] = [];
  for (const arr of histories.values()) {
    for (const m of arr) {
      if (m.user) moreUserIds.push(m.user);
      const t = m.text ?? "";
      const re = /<@(U[A-Z0-9]+)(?:\|[^>]+)?>/g;
      let mt: RegExpExecArray | null;
      while ((mt = re.exec(t)) !== null) moreUserIds.push(mt[1]);
    }
  }
  const additional = await resolveUsersBatch(moreUserIds);
  for (const [k, v] of additional) if (!users.has(k)) users.set(k, v);

  // history 메시지 중 노이즈성 시스템 메시지 (참여/퇴장 등) 제외
  const SYSTEM_SUBTYPES = new Set([
    "channel_join",
    "channel_leave",
    "channel_topic",
    "channel_purpose",
    "channel_name",
    "channel_archive",
    "channel_unarchive",
  ]);

  const channels: SlackDigestChannel[] = [];
  for (const e of enriched) {
    const b = e.bucket;
    const hist = histories.get(b.id);
    let messages: SlackDigestMessage[];

    if (hist && hist.length > 0) {
      // 양쪽 발화 합치기. ts 로 dedupe (search 와 history 가 같은 메시지 중복).
      const byTs = new Map<string, SlackDigestMessage>();

      // 1) history 의 모든 메시지 (시스템 메시지 제외)
      for (const m of hist) {
        if (m.subtype && SYSTEM_SUBTYPES.has(m.subtype)) continue;
        const text = (m.text ?? "").trim();
        if (!text) continue;
        const isMe = !!myUserId && m.user === myUserId;
        const author = isMe
          ? "나"
          : m.user
            ? users.get(m.user)?.realName ?? m.user
            : m.bot_profile?.name ?? "bot";
        byTs.set(m.ts, {
          isoAt: toIsoKst(m.ts),
          author,
          isMe,
          text: resolveMentions(text, users),
        });
      }
      // 2) search 결과로 permalink 보강 (같은 ts 면 덮어쓰지 않고 permalink 만)
      for (const sm of b.matches) {
        const existing = byTs.get(sm.ts);
        if (existing) {
          if (!existing.permalink && sm.permalink) {
            existing.permalink = sm.permalink;
          }
        } else {
          // history 엔 없는데 search 에만 있는 경우 (스레드 답글 등) — 그대로 추가
          byTs.set(sm.ts, {
            isoAt: toIsoKst(sm.ts),
            author: "나",
            isMe: true,
            text: resolveMentions(sm.text ?? "", users),
            permalink: sm.permalink,
          });
        }
      }

      messages = Array.from(byTs.values()).sort((a, z) =>
        a.isoAt < z.isoAt ? -1 : a.isoAt > z.isoAt ? 1 : 0,
      );
    } else {
      // search-only — 본인 메시지만
      messages = b.matches
        .sort((a, z) => Number(a.ts) - Number(z.ts))
        .map((m) => ({
          isoAt: toIsoKst(m.ts),
          author: "나",
          isMe: true,
          text: resolveMentions(m.text ?? "", users),
          permalink: m.permalink,
        }));
    }

    channels.push({
      id: b.id,
      label: e.label,
      kind: b.kind,
      partnerIsBot: e.partnerIsBot,
      hasFullContext: !!hist && hist.length > 0,
      messages,
    });
  }

  const totalMessages = channels.reduce((s, c) => s + c.messages.length, 0);

  return {
    available: true,
    myUserId,
    myDisplayName,
    team,
    totalMessages,
    channels,
    fetchedAt,
  };
}
