"use client";

import { CheckSquare, Square } from "lucide-react";
import { useTicketChecklist } from "@/hooks/use-ticket-checklist";

/** design.md의 구현 체크리스트를 파싱하여 진행률과 함께 표시 */
export function ChecklistCard({ ticketId }: { ticketId: string }) {
  const { data, isLoading } = useTicketChecklist(ticketId);

  if (isLoading) return null;
  if (!data || !data.exists || data.items.length === 0) return null;

  const total = data.items.length;
  const done = data.items.filter((i) => i.checked).length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="rounded border border-[var(--color-border)] p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <CheckSquare
            size={11}
            className="text-[var(--color-foreground-dim)]"
          />
          <span className="text-[10px] text-[var(--color-foreground-dim)]">
            구현 체크리스트
          </span>
        </div>
        <span
          className={`text-[10px] font-mono ${
            pct === 100
              ? "text-green-400"
              : "text-[var(--color-foreground-muted)]"
          }`}
        >
          {done}/{total} · {pct}%
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="h-1 bg-[var(--color-border)] rounded overflow-hidden mb-2">
        <div
          className="h-full bg-green-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
        {data.items.map((item, idx) => (
          <li
            key={`${item.line}-${idx}`}
            className="flex items-start gap-1.5 text-xs"
          >
            {item.checked ? (
              <CheckSquare
                size={11}
                className="text-green-400 shrink-0 mt-0.5"
              />
            ) : (
              <Square
                size={11}
                className="text-[var(--color-foreground-dim)] shrink-0 mt-0.5"
              />
            )}
            <span
              className={
                item.checked
                  ? "line-through text-[var(--color-foreground-dim)]"
                  : "text-[var(--color-foreground)]"
              }
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
