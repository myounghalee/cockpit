"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { StickyNote, RefreshCw, ExternalLink, Clock, Tag } from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";
import { cn } from "@/lib/utils";

interface MemoResponse {
  id: string;
  title: string;
  content: string;
  tags: string;
  projectId: string | null;
  project: { id: string; name: string; path: string } | null;
  pinnedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  memoId: string;
}

export function MemoPaneContent({ memoId }: Props) {
  const markdownFontSize = useTerminalStore((s) => s.markdownFontSize);
  const [data, setData] = useState<MemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!memoId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/memos/${memoId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body as MemoResponse);
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoId]);

  const tagList = useMemo(
    () =>
      (data?.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [data?.tags],
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-background)]">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs">
        <StickyNote
          size={14}
          className="text-[var(--color-accent)] flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">
            {data?.title ?? (loading ? "로딩 중…" : "메모")}
          </div>
          {data && (
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-foreground-dim)] mt-0.5">
              {data.project && (
                <span className="font-mono">{data.project.name}</span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock size={9} />
                {new Date(data.updatedAt).toLocaleString("ko-KR", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {tagList.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Tag size={9} />
                  {tagList.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] disabled:opacity-50"
          title="다시 불러오기"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <Link
          href={`/memo?id=${memoId}`}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
          title="메모 페이지에서 편집"
        >
          <ExternalLink size={13} />
        </Link>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-sm text-red-500">메모 로드 실패: {error}</div>
        )}
        {!error && !loading && data && (
          <div
            className={cn(
              "px-5 py-4 prose prose-sm dark:prose-invert max-w-none",
              "prose-headings:mt-4 prose-headings:mb-2",
              "prose-p:my-2 prose-ul:my-2 prose-ol:my-2",
              "prose-code:text-[var(--color-accent)] prose-code:bg-[var(--color-surface)]",
              "prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
              "prose-pre:bg-[var(--color-surface)] prose-pre:border prose-pre:border-[var(--color-border)]",
            )}
            style={{ fontSize: `${markdownFontSize}px` }}
          >
            {data.content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.content}
              </ReactMarkdown>
            ) : (
              <p className="italic text-[var(--color-foreground-dim)]">
                (본문 비어 있음)
              </p>
            )}
          </div>
        )}
        {!error && !data && loading && (
          <div className="p-6 text-center text-sm text-[var(--color-foreground-dim)]">
            불러오는 중…
          </div>
        )}
      </div>
    </div>
  );
}
