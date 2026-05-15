"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  RefreshCw,
  GitCommit,
  FolderKanban,
  MessageSquare,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Copy,
  Check,
  Settings,
  X,
  RotateCcw,
  Save,
  Send,
  User,
  Bot,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeMarkdown } from "@/lib/markdown-normalize";

type RangeKey = "1d" | "7d" | "30d";
const RANGES: Record<RangeKey, { label: string; days: number }> = {
  "1d": { label: "1일", days: 1 },
  "7d": { label: "7일", days: 7 },
  "30d": { label: "30일", days: 30 },
};

interface GitCommitEntry {
  hash: string;
  date: string;
  author: string;
  subject: string;
}
interface ProjectCommits {
  projectId: string;
  projectName: string;
  projectPath: string;
  commits: GitCommitEntry[];
}
interface SlackDigestMessage {
  isoAt: string;
  text: string;
  permalink?: string;
}
interface SlackDigestChannel {
  id: string;
  label: string;
  kind: "public" | "private" | "dm" | "group_dm" | "unknown";
  partnerIsBot: boolean;
  messages: SlackDigestMessage[];
}
interface SlackDigest {
  available: boolean;
  reason?: string;
  myUserId: string | null;
  myDisplayName: string | null;
  team: string | null;
  totalMessages: number;
  channels: SlackDigestChannel[];
  fetchedAt: string;
}

interface DigestResponse {
  rangeDays: number;
  from: string;
  to: string;
  gitEmail: string | null;
  commitsByProject: ProjectCommits[];
  totalCommits: number;
  sessionCount: number;
  sessionsByProject: Array<{ projectName: string; count: number }>;
  dailyDates: string[];
  slack: SlackDigest;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

interface SummaryResponse {
  rangeDays: number;
  from: string;
  to: string;
  markdown: string;
  generatedAt: string;
  cached: boolean;
  sessionId: string;
  messages: ChatMessage[];
}

interface PromptResponse {
  content: string;
  isCustom: boolean;
  path: string;
  default: string;
}

export function DigestTab() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<Set<string>>(
    new Set(),
  );
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  async function load(r: RangeKey) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/digest?days=${RANGES[r].days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DigestResponse;
      setData(json);
      // default: 모두 접힌 상태. 사용자가 필요한 것만 펼치도록.
      setExpandedProject(new Set());
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadCachedSummary(r: RangeKey) {
    try {
      const res = await fetch(
        `/api/insights/digest/summary?days=${RANGES[r].days}&cacheOnly=1`,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json && typeof json.markdown === "string") {
        setSummary(json as SummaryResponse);
      }
    } catch {
      // cache miss — 조용히 무시
    }
  }

  async function generateSummary(r: RangeKey, refresh: boolean) {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const qs = `days=${RANGES[r].days}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(`/api/insights/digest/summary?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSummary(json as SummaryResponse);
    } catch (err) {
      setSummaryError((err as Error).message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function copySummary() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || !summary || chatSending) return;
    setChatSending(true);
    setChatError(null);
    // 낙관적 추가 (UX — 응답 도착 전에도 내 메시지가 보이도록)
    const optimistic: ChatMessage = {
      role: "user",
      content: msg,
      at: new Date().toISOString(),
    };
    setSummary({ ...summary, messages: [...summary.messages, optimistic] });
    setChatInput("");
    try {
      const res = await fetch("/api/insights/digest/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days: RANGES[range].days,
          message: msg,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSummary(json as SummaryResponse);
    } catch (err) {
      setChatError((err as Error).message);
      // 실패 시 낙관 추가 롤백
      setSummary((prev) =>
        prev ? { ...prev, messages: prev.messages.slice(0, -1) } : prev,
      );
      setChatInput(msg);
    } finally {
      setChatSending(false);
    }
  }

  useEffect(() => {
    load(range);
    // 범위 바뀌면 기존 요약/chat 상태 비우고, 캐시 있으면 자동 로드
    setSummary(null);
    setSummaryError(null);
    setChatInput("");
    setChatError(null);
    loadCachedSummary(range);
  }, [range]);

  const toggleProject = (id: string) => {
    setExpandedProject((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={cn(
                "text-xs px-2.5 h-7",
                range === k
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
              )}
            >
              {RANGES[k].label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {data?.gitEmail && (
          <span className="text-[11px] text-[var(--color-foreground-dim)] font-mono">
            {data.gitEmail}
          </span>
        )}
        <button
          onClick={() => generateSummary(range, !!summary)}
          disabled={summaryLoading || loading || !data}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
          title={
            summary
              ? "캐시 무시하고 claude -p 로 다시 생성"
              : "claude -p 로 이번 기간 요약 생성 (같은 날은 자동 캐시)"
          }
        >
          <Sparkles
            size={12}
            className={summaryLoading ? "animate-pulse" : ""}
          />
          {summaryLoading
            ? "정리 중…"
            : summary
              ? "AI 정리 재생성"
              : "AI 정리"}
        </button>
        <button
          onClick={() => setShowPromptEditor(true)}
          className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
          title="AI 정리 프롬프트 편집"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={() => load(range)}
          disabled={loading}
          className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && <div className="text-sm text-red-500">로드 실패: {error}</div>}

        {/* 요약 카드 */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              Icon={GitCommit}
              label="커밋"
              value={data.totalCommits}
              sub={`${data.commitsByProject.length}개 프로젝트`}
            />
            <SummaryCard
              Icon={MessageSquare}
              label="Claude 세션"
              value={data.sessionCount}
              sub={`${data.sessionsByProject.length}개 프로젝트`}
            />
            <SummaryCard
              Icon={CalendarIcon}
              label="Daily 기록"
              value={data.dailyDates.length}
              sub="일자"
            />
            <SummaryCard
              Icon={Hash}
              label="Slack 메시지"
              value={data.slack.available ? data.slack.totalMessages : 0}
              sub={
                data.slack.available
                  ? `${data.slack.channels.length}개 채널/DM`
                  : "토큰 미설정"
              }
            />
          </div>
        )}

        {/* AI 정리 */}
        {summaryError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-500">
            AI 정리 생성 실패: {summaryError}
          </div>
        )}
        {summaryLoading && !summary && (
          <div className="rounded-md border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-foreground-dim)]">
            <Sparkles
              size={16}
              className="inline-block mr-2 animate-pulse text-[var(--color-accent)]"
            />
            claude CLI 로 정리 중… (보통 10~30초 소요)
          </div>
        )}
        {summary && (
          <section className="rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs flex-wrap">
              <Sparkles size={12} className="text-[var(--color-accent)]" />
              <span className="font-medium">AI 정리</span>
              <span className="text-[10px] text-[var(--color-foreground-dim)] font-mono">
                {summary.from.slice(0, 10)} ~ {summary.to.slice(0, 10)}
              </span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-sm font-mono",
                  summary.cached
                    ? "bg-[var(--color-surface)] text-[var(--color-foreground-dim)]"
                    : "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
                )}
                title={
                  summary.cached
                    ? "저장된 캐시 — 재생성 버튼으로 갱신"
                    : "방금 생성됨"
                }
              >
                {summary.cached ? "캐시" : "NEW"} · {formatTimestamp(summary.generatedAt)}
              </span>
              <div className="flex-1" />
              <button
                onClick={copySummary}
                className="flex items-center gap-1 px-2 h-6 rounded text-[11px] hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
                title="마크다운 복사"
              >
                {copied ? (
                  <>
                    <Check size={11} />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy size={11} />
                    복사
                  </>
                )}
              </button>
            </div>
            <article className="markdown-body px-5 py-4 text-sm text-[var(--color-foreground)]">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {normalizeMarkdown(summary.markdown)}
              </ReactMarkdown>
            </article>
          </section>
        )}

        {/* Chat — 요약 세션 이어가기 */}
        {summary && (
          <section className="rounded-md border border-[var(--color-border)]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)]">
              <Bot size={12} />
              후속 대화 · {summary.messages.length}개 메시지
              <span className="text-[10px] font-mono opacity-60">
                · session {summary.sessionId.slice(0, 8)}
              </span>
            </div>
            {summary.messages.length > 0 && (
              <ul className="divide-y divide-[var(--color-border)] max-h-[480px] overflow-y-auto">
                {summary.messages.map((m, idx) => (
                  <li
                    key={`${m.at}-${idx}`}
                    className={cn(
                      "px-4 py-3 text-sm flex gap-3",
                      m.role === "user"
                        ? "bg-[var(--color-surface)]/50"
                        : "bg-transparent",
                    )}
                  >
                    <div
                      className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                        m.role === "user"
                          ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
                          : "bg-[var(--color-surface)] text-[var(--color-foreground-muted)]",
                      )}
                    >
                      {m.role === "user" ? (
                        <User size={12} />
                      ) : (
                        <Bot size={12} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {m.role === "assistant" ? (
                        <article className="markdown-body text-sm">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                          >
                            {normalizeMarkdown(m.content)}
                          </ReactMarkdown>
                        </article>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {chatSending && (
                  <li className="px-4 py-3 text-sm flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-foreground-muted)]">
                      <Bot size={12} className="animate-pulse" />
                    </div>
                    <div className="text-[var(--color-foreground-dim)] italic">
                      답변 생성 중…
                    </div>
                  </li>
                )}
              </ul>
            )}
            {chatError && (
              <div className="px-4 py-2 text-xs text-red-500 border-t border-[var(--color-border)]">
                {chatError}
              </div>
            )}
            <div className="p-3 border-t border-[var(--color-border)] flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    !chatSending
                  ) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
                placeholder="이 정리에 대해 추가로 물어보기 (예: FNF 프로젝트만 더 자세히 / 주간보고 포맷으로 다시 써줘) — ⌘/Ctrl+Enter 로 전송"
                rows={2}
                disabled={chatSending}
                className="flex-1 resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-60"
              />
              <button
                onClick={() => void sendChat()}
                disabled={chatSending || !chatInput.trim()}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
                title="⌘/Ctrl+Enter"
              >
                <Send size={12} />
                {chatSending ? "전송 중…" : "보내기"}
              </button>
            </div>
          </section>
        )}

        {/* 커밋 — 프로젝트별 */}
        {data && data.commitsByProject.length > 0 && (
          <section className="rounded-md border border-[var(--color-border)]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)]">
              <GitCommit size={12} />
              프로젝트별 커밋
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {data.commitsByProject.map((p) => {
                const expanded = expandedProject.has(p.projectId);
                return (
                  <li key={p.projectId}>
                    <button
                      onClick={() => toggleProject(p.projectId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--color-surface-hover)]"
                    >
                      {expanded ? (
                        <ChevronDown size={14} className="flex-shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="flex-shrink-0" />
                      )}
                      <FolderKanban
                        size={12}
                        className="text-[var(--color-accent)] flex-shrink-0"
                      />
                      <span className="font-medium">{p.projectName}</span>
                      <span className="text-[11px] text-[var(--color-foreground-dim)]">
                        {p.commits.length}건
                      </span>
                    </button>
                    {expanded && (
                      <ul className="pb-2 pl-9 pr-3 text-xs space-y-0.5">
                        {p.commits.map((c) => (
                          <li key={c.hash} className="flex gap-2">
                            <span className="font-mono text-[var(--color-foreground-dim)] flex-shrink-0">
                              {formatDate(c.date)}
                            </span>
                            <span className="font-mono text-[var(--color-accent)] flex-shrink-0">
                              {c.hash.slice(0, 7)}
                            </span>
                            <span className="min-w-0 break-words">
                              {c.subject}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {data && data.commitsByProject.length === 0 && !loading && (
          <div className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-foreground-dim)] text-center">
            이 기간에 본인({data.gitEmail ?? "unknown"}) 커밋 없음
          </div>
        )}

        {/* Claude 세션 — 프로젝트별 카운트 */}
        {data && data.sessionsByProject.length > 0 && (
          <section className="rounded-md border border-[var(--color-border)]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)]">
              <MessageSquare size={12} />
              Claude 세션 — 프로젝트별
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {data.sessionsByProject.map((s) => (
                <li
                  key={s.projectName}
                  className="px-3 py-1.5 flex items-center gap-2 text-xs"
                >
                  <span className="flex-1 truncate">{s.projectName}</span>
                  <span className="font-mono text-[var(--color-foreground-dim)]">
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Slack — 채널/DM별 메시지 수 (펼치면 본문) */}
        {data && data.slack.available && data.slack.channels.length > 0 && (
          <SlackSection slack={data.slack} />
        )}
        {data && !data.slack.available && (
          <section className="rounded-md border border-[var(--color-border)] p-3 text-xs text-[var(--color-foreground-dim)]">
            <Hash size={12} className="inline mr-1" />
            Slack 활동 — {data.slack.reason ?? "사용 불가"}{" "}
            <Link
              href="/settings"
              className="underline hover:text-[var(--color-accent)]"
            >
              설정에서 user token 추가
            </Link>
          </section>
        )}

        {/* Daily dates */}
        {data && data.dailyDates.length > 0 && (
          <section className="rounded-md border border-[var(--color-border)]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)]">
              <CalendarIcon size={12} />
              Daily 로그가 있는 날짜
            </div>
            <div className="p-3 flex flex-wrap gap-1.5 text-xs">
              {data.dailyDates.map((d) => (
                <Link
                  key={d}
                  href={`/insights`}
                  className="px-2 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] font-mono"
                >
                  {d}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {showPromptEditor && (
        <PromptEditorModal onClose={() => setShowPromptEditor(false)} />
      )}
    </div>
  );
}

function PromptEditorModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<PromptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/insights/digest/prompt");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PromptResponse;
        if (!mounted) return;
        setMeta(json);
        setContent(json.content);
      } catch (err) {
        if (!mounted) return;
        setError((err as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/digest/prompt", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSavedAt(new Date().toISOString());
      // meta 갱신
      setMeta((prev) =>
        prev ? { ...prev, content, isCustom: true } : prev,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!meta) return;
    if (!confirm("기본 프롬프트로 되돌릴까요? 사용자가 편집한 내용은 삭제됩니다.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/digest/prompt", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setContent(meta.default);
      setMeta({ ...meta, content: meta.default, isCustom: false });
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-md w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Sparkles size={14} className="text-[var(--color-accent)]" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">AI 정리 프롬프트 편집</div>
            <div className="text-[11px] text-[var(--color-foreground-dim)] font-mono truncate">
              {meta?.path ?? "~/.cockpit-userdata/digest-prompt.md"}
              {meta?.isCustom ? " · (사용자 편집됨)" : " · (기본값)"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
            title="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-4 gap-2">
          <p className="text-[11px] text-[var(--color-foreground-dim)]">
            말투/구성/섹션을 자유롭게 바꿀 수 있습니다. 프롬프트 끝에 자동으로
            {" "}<code>---{"\\n"}데이터:{"\\n"}...</code>{" "}섹션이 붙어 커밋·세션·daily
            내용이 전달돼요. 프롬프트를 바꾸면 기존 캐시는 자동 무효화됩니다.
          </p>
          {error && (
            <div className="text-xs text-red-500">에러: {error}</div>
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading}
            className="flex-1 min-h-[300px] w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder={loading ? "로딩 중…" : "프롬프트 내용"}
            spellCheck={false}
          />
          <div className="flex items-center gap-2 pt-1">
            {savedAt && (
              <span className="text-[10px] text-[var(--color-foreground-dim)]">
                저장됨 · {formatTimestamp(savedAt)}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={resetToDefault}
              disabled={saving || loading || !meta?.isCustom}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
              title="기본 프롬프트로 되돌리기"
            >
              <RotateCcw size={12} />
              기본값
            </button>
            <button
              onClick={save}
              disabled={saving || loading || !content.trim()}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save size={12} />
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlackSection({ slack }: { slack: SlackDigest }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section className="rounded-md border border-[var(--color-border)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)]">
        <Hash size={12} />
        Slack — 채널/DM별 본인 메시지
        {slack.myDisplayName && (
          <span className="text-[10px] font-mono">
            · {slack.myDisplayName}
            {slack.team ? ` @ ${slack.team}` : ""}
          </span>
        )}
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {slack.channels.map((c) => {
          const open = expanded.has(c.id);
          return (
            <li key={c.id}>
              <button
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--color-surface-hover)]"
              >
                {open ? (
                  <ChevronDown size={14} className="flex-shrink-0" />
                ) : (
                  <ChevronRight size={14} className="flex-shrink-0" />
                )}
                <Hash
                  size={12}
                  className="text-[var(--color-accent)] flex-shrink-0"
                />
                <span className="font-medium truncate">{c.label}</span>
                <span className="text-[11px] text-[var(--color-foreground-dim)] flex-shrink-0">
                  {c.messages.length}건
                </span>
              </button>
              {open && (
                <ul className="pb-2 pl-9 pr-3 text-xs space-y-0.5">
                  {c.messages.slice(0, 50).map((m, idx) => (
                    <li
                      key={`${c.id}-${idx}`}
                      className="flex gap-2"
                    >
                      <span className="font-mono text-[var(--color-foreground-dim)] flex-shrink-0">
                        {m.isoAt.slice(5, 16).replace("T", " ")}
                      </span>
                      <span className="min-w-0 break-words">
                        {m.permalink ? (
                          <a
                            href={m.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {m.text}
                          </a>
                        ) : (
                          m.text
                        )}
                      </span>
                    </li>
                  ))}
                  {c.messages.length > 50 && (
                    <li className="text-[var(--color-foreground-dim)]">
                      … (외 {c.messages.length - 50}건)
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SummaryCard({
  Icon,
  label,
  value,
  sub,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-foreground-dim)] mb-1">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-2xl font-semibold font-mono">{value}</div>
      {sub && (
        <div className="text-[11px] text-[var(--color-foreground-dim)] mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}
