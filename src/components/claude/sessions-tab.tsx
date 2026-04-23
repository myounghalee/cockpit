"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, MessageSquare, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenAggregate {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
}

interface SessionSummary {
  id: string;
  projectDir: string;
  projectName: string;
  filePath: string;
  mtime: number;
  firstTs: string | null;
  lastTs: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  firstUserText: string | null;
  tokens: TokenAggregate;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - ms;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toISOString().slice(0, 10);
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(2) + "M";
}

export function SessionsTab() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("__all__");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/claude/sessions?limit=100");
      const json = (await res.json()) as { sessions: SessionSummary[] };
      setSessions(json.sessions ?? []);
    } catch (err) {
      console.warn("[sessions-tab] 로드 실패:", err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) map.set(s.projectDir, s.projectName);
    return Array.from(map.entries())
      .map(([dir, name]) => ({ dir, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const filtered = useMemo(() => {
    if (projectFilter === "__all__") return sessions;
    return sessions.filter((s) => s.projectDir === projectFilter);
  }, [sessions, projectFilter]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="__all__">전체 프로젝트 ({projects.length})</option>
          {projects.map((p) => (
            <option key={p.dir} value={p.dir}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-[var(--color-foreground-dim)]">
          {filtered.length} 세션
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && !loading && (
          <div className="p-8 text-center text-sm text-[var(--color-foreground-dim)]">
            세션이 없어요. Claude Code 를 아직 사용하지 않았거나, 로컬에
            transcript 가 저장되지 않은 상태예요.
          </div>
        )}
        <ul className="divide-y divide-[var(--color-border)]">
          {filtered.map((s) => (
            <li
              key={s.filePath}
              className="px-4 py-3 hover:bg-[var(--color-surface-hover)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-foreground-dim)] mb-0.5">
                    <Folder size={11} />
                    <span className="truncate">{s.projectName}</span>
                    <span>·</span>
                    <span className="font-mono">{s.id.slice(0, 8)}</span>
                  </div>
                  <div className={cn(
                    "text-sm line-clamp-2 break-words",
                    s.firstUserText
                      ? ""
                      : "text-[var(--color-foreground-dim)] italic",
                  )}>
                    {s.firstUserText ?? "(첫 사용자 메시지 없음)"}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right text-[11px] text-[var(--color-foreground-dim)] space-y-0.5">
                  <div>{formatTime(s.mtime)}</div>
                  <div className="flex items-center justify-end gap-1">
                    <MessageSquare size={10} />
                    {s.messageCount}
                  </div>
                  <div
                    className="font-mono"
                    title={`in ${s.tokens.input} / out ${s.tokens.output} / cache+${s.tokens.cacheCreate} /read ${s.tokens.cacheRead}`}
                  >
                    {formatTokens(s.tokens.total)} tok
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

