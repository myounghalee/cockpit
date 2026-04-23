"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Search, StickyNote, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoItem {
  id: string;
  title: string;
  tags: string;
  projectName: string | null;
  pinnedAt: string | null;
  updatedAt: string;
}

interface Props {
  trigger: React.ReactNode;
  onSelect: (memo: MemoItem) => void;
}

/**
 * 터미널 탭 바에서 메모를 선택해 새 탭으로 여는 드롭다운 picker.
 * 프로젝트별 구분 없이 전체 메모를 보여주고, 제목/태그/프로젝트명으로 즉시 검색.
 */
export function MemoPicker({ trigger, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/memos")
      .then((r) => r.json())
      .then((data: { memos: MemoItem[] }) => {
        if (!cancelled) setMemos(data.memos ?? []);
      })
      .catch(() => {
        if (!cancelled) setMemos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memos;
    return memos.filter((m) => {
      const hay = `${m.title} ${m.tags} ${m.projectName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [memos, query]);

  const listRef = useRef<HTMLDivElement>(null);
  const focusItemAt = (idx: number) => {
    if (!listRef.current) return;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>(
        "button[data-memo-item]",
      ),
    );
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    items[clamped]?.focus();
  };

  const finish = (memo: MemoItem) => {
    onSelect(memo);
    setOpen(false);
    setQuery("");
  };

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={4}
          className="z-50 w-[320px] max-h-[420px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg flex flex-col overflow-hidden"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border)]">
            <Search size={12} className="text-[var(--color-foreground-dim)]" />
            <input
              autoFocus
              placeholder="메모 검색 (제목·태그·프로젝트)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  focusItemAt(0);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[0]) finish(filtered[0]);
                }
              }}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-foreground-dim)]"
            />
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto p-1">
            {loading && (
              <div className="px-2 py-3 text-xs text-[var(--color-foreground-dim)] text-center">
                불러오는 중…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-[var(--color-foreground-dim)] text-center">
                {memos.length === 0
                  ? "메모가 없어요. 메모 페이지에서 먼저 작성하세요."
                  : "검색 결과 없음"}
              </div>
            )}
            {filtered.map((m, idx) => {
              const tags = m.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
              return (
                <button
                  key={m.id}
                  data-memo-item
                  onClick={() => finish(m)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusItemAt(idx + 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (idx === 0) {
                        const searchInput = (e.currentTarget
                          .closest(".z-50")
                          ?.querySelector("input") ?? null) as
                          | HTMLInputElement
                          | null;
                        searchInput?.focus();
                      } else {
                        focusItemAt(idx - 1);
                      }
                    }
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] focus:outline-none",
                  )}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    {m.pinnedAt && (
                      <Pin
                        size={10}
                        className="flex-shrink-0 text-[var(--color-accent)]"
                      />
                    )}
                    <StickyNote
                      size={11}
                      className="flex-shrink-0 text-[var(--color-foreground-dim)]"
                    />
                    <span className="truncate text-xs flex-1">
                      {m.title || "(제목 없음)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--color-foreground-dim)]">
                    <span className="font-mono truncate">
                      {m.projectName ?? "전역"}
                    </span>
                    {tags.length > 0 && (
                      <span className="truncate">· {tags.join(", ")}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
