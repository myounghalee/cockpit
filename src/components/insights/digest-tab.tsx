"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  GitCommit,
  FolderKanban,
  MessageSquare,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RangeKey = "7d" | "30d" | "90d";
const RANGES: Record<RangeKey, { label: string; days: number }> = {
  "7d": { label: "7일", days: 7 },
  "30d": { label: "30일", days: 30 },
  "90d": { label: "90일", days: 90 },
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
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DigestTab() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<Set<string>>(
    new Set(),
  );

  async function load(r: RangeKey) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/digest?days=${RANGES[r].days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DigestResponse;
      setData(json);
      // 처음엔 상위 3개 프로젝트만 펼침
      setExpandedProject(
        new Set(json.commitsByProject.slice(0, 3).map((p) => p.projectId)),
      );
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(range);
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
          <div className="grid grid-cols-3 gap-3">
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
          </div>
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
    </div>
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
