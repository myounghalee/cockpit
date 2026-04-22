"use client";

import { Pin, Archive, FileText, Square, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/memo";
import { useUpdateMemo } from "@/hooks/use-memos";

interface MemoListProps {
  memos: Memo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}

function MemoRow({
  memo,
  selected,
  onSelect,
}: {
  memo: Memo;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const update = useUpdateMemo();
  const tags = memo.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const preview = memo.content.slice(0, 60).replace(/\n+/g, " ");
  const completed = Boolean(memo.completedAt);
  return (
    <button
      onClick={() => onSelect(memo.id)}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-[var(--color-border)] transition-colors",
        selected
          ? "bg-[var(--color-accent)]/15"
          : "hover:bg-[var(--color-surface-hover)]",
        completed && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          role="checkbox"
          aria-checked={completed}
          tabIndex={0}
          title={completed ? "완료 취소" : "완료로 표시"}
          onClick={(e) => {
            e.stopPropagation();
            update.mutate({ id: memo.id, completed: !completed });
          }}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              update.mutate({ id: memo.id, completed: !completed });
            }
          }}
          className={cn(
            "mt-0.5 flex-shrink-0 cursor-pointer rounded hover:bg-[var(--color-surface-hover)] p-0.5 -m-0.5",
            completed
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-foreground-dim)]",
          )}
        >
          {completed ? <CheckSquare size={14} /> : <Square size={14} />}
        </span>
        {memo.pinnedAt && (
          <Pin
            size={12}
            className="mt-1 text-[var(--color-accent)] flex-shrink-0"
          />
        )}
        {memo.archivedAt && (
          <Archive
            size={12}
            className="mt-1 text-[var(--color-foreground-dim)] flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-sm font-medium truncate text-[var(--color-foreground)]",
                completed && "line-through text-[var(--color-foreground-muted)]",
              )}
            >
              {memo.title || "(제목 없음)"}
            </span>
          </div>
          {preview && (
            <p className="mt-0.5 text-xs text-[var(--color-foreground-muted)] truncate">
              {preview}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-foreground-dim)]">
            <span>{relativeTime(memo.updatedAt)}</span>
            {memo.projectName && (
              <span className="truncate">· {memo.projectName}</span>
            )}
            {tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="px-1 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export function MemoList({ memos, selectedId, onSelect }: MemoListProps) {
  const pinned = memos.filter((m) => m.pinnedAt);
  const rest = memos.filter((m) => !m.pinnedAt);

  if (memos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-foreground-dim)] text-sm p-6 text-center">
        <FileText size={24} className="mb-2 opacity-40" />
        <div>메모가 없습니다</div>
        <div className="text-xs mt-1">새 메모 버튼을 눌러 시작하세요</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {pinned.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-foreground-dim)] bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            고정됨
          </div>
          {pinned.map((m) => (
            <MemoRow
              key={m.id}
              memo={m}
              selected={m.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
      {rest.length > 0 && (
        <>
          {pinned.length > 0 && (
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-foreground-dim)] bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              최근
            </div>
          )}
          {rest.map((m) => (
            <MemoRow
              key={m.id}
              memo={m}
              selected={m.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}
