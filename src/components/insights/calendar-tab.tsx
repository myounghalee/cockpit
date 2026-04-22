"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarEventType } from "@/types/calendar";

const EVENT_STYLES: Record<
  CalendarEventType,
  { label: string; dot: string; text: string }
> = {
  ticket_created: {
    label: "생성",
    dot: "bg-blue-400",
    text: "text-blue-300",
  },
  ticket_started: {
    label: "시작",
    dot: "bg-purple-400",
    text: "text-purple-300",
  },
  ticket_completed: {
    label: "완료",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  },
  memo_created: {
    label: "메모",
    dot: "bg-amber-400",
    text: "text-amber-300",
  },
};

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d: Date) {
  // 일요일 시작
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface Props {
  projectId: string | null;
}

export function CalendarTab({ projectId }: Props) {
  const router = useRouter();

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // 그리드 범위: 해당 월을 완전히 덮도록 6주
  const gridStart = useMemo(() => startOfWeek(startOfMonth(viewMonth)), [viewMonth]);
  const gridEnd = useMemo(() => {
    const end = new Date(gridStart);
    end.setDate(end.getDate() + 42 - 1); // 42 cells
    end.setHours(23, 59, 59, 999);
    return end;
  }, [gridStart]);

  const { data, isLoading } = useCalendarEvents({
    from: gridStart,
    to: gridEnd,
    projectId,
  });
  const events = useMemo(() => data?.events ?? [], [data]);

  // 날짜별 이벤트 그룹핑
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dateKey(new Date(e.timestamp));
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    return map;
  }, [events]);

  const selectedEvents = useMemo(() => {
    const list = eventsByDate.get(dateKey(selectedDate)) ?? [];
    // 시간순 (오전 → 오후)
    return [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [eventsByDate, selectedDate]);

  // 42 칸
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [gridStart]);

  const today = new Date();

  const goEventTarget = (e: CalendarEvent) => {
    if (e.ticketId) router.push(`/kanban?ticket=${e.ticketId}`);
    else if (e.memoId) router.push("/memo");
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* 달력 그리드 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
              )
            }
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm font-semibold tabular-nums">
            {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
              )
            }
          >
            <ChevronRight size={14} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const n = new Date();
              setViewMonth(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelectedDate(n);
            }}
          >
            오늘
          </Button>
          <div className="flex-1" />
          {isLoading && (
            <span className="text-xs text-[var(--color-foreground-dim)]">
              로딩 중…
            </span>
          )}
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
          {WEEK_LABELS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "px-2 py-1.5 text-[11px] font-medium text-center",
                i === 0 && "text-red-400",
                i === 6 && "text-blue-400",
                i !== 0 && i !== 6 && "text-[var(--color-foreground-muted)]",
              )}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
          {days.map((d, i) => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, selectedDate);
            const dayEvents = eventsByDate.get(key) ?? [];

            // 타입별 카운트
            const counts: Partial<Record<CalendarEventType, number>> = {};
            for (const e of dayEvents) {
              counts[e.type] = (counts[e.type] ?? 0) + 1;
            }

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(d)}
                className={cn(
                  "border-r border-b border-[var(--color-border)] p-1.5 text-left flex flex-col gap-1 min-w-0 transition-colors",
                  "hover:bg-[var(--color-surface-hover)]",
                  !inMonth && "bg-[var(--color-background)]/40",
                  isSelected &&
                    "ring-1 ring-inset ring-[var(--color-accent)] bg-[var(--color-accent)]/5",
                  (i + 1) % 7 === 0 && "border-r-0",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      !inMonth && "text-[var(--color-foreground-dim)]",
                      inMonth && d.getDay() === 0 && "text-red-400",
                      inMonth && d.getDay() === 6 && "text-blue-400",
                      inMonth &&
                        d.getDay() !== 0 &&
                        d.getDay() !== 6 &&
                        "text-[var(--color-foreground)]",
                      isToday &&
                        "inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-accent)] text-white font-bold",
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>

                {/* 이벤트 표시 */}
                {dayEvents.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(["ticket_completed", "ticket_started", "ticket_created", "memo_created"] as CalendarEventType[])
                      .map((t) => {
                        const c = counts[t];
                        if (!c) return null;
                        return (
                          <span
                            key={t}
                            className={cn(
                              "flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded",
                              "bg-[var(--color-surface)]/60",
                              EVENT_STYLES[t].text,
                            )}
                          >
                            <Circle
                              size={6}
                              fill="currentColor"
                              className="flex-shrink-0"
                            />
                            {c}
                          </span>
                        );
                      })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택일 상세 */}
      <aside className="w-80 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-foreground-dim)]">
            {isSameDay(selectedDate, today) ? "오늘" : "선택된 날짜"}
          </div>
          <div className="text-sm font-semibold">
            {selectedDate.toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </div>
          <div className="text-xs text-[var(--color-foreground-muted)] mt-0.5">
            이벤트 {selectedEvents.length}건
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedEvents.length === 0 && (
            <div className="text-xs text-[var(--color-foreground-dim)] text-center py-8">
              이 날은 활동이 없었어요
            </div>
          )}
          {selectedEvents.map((e) => {
            const time = new Date(e.timestamp).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const style = EVENT_STYLES[e.type];
            return (
              <button
                key={e.id}
                onClick={() => goEventTarget(e)}
                className={cn(
                  "w-full text-left p-2.5 rounded-md border border-[var(--color-border)]",
                  "hover:bg-[var(--color-surface-hover)] transition-colors",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      style.dot,
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      style.text,
                    )}
                  >
                    {style.label}
                  </span>
                  <span className="text-[10px] text-[var(--color-foreground-dim)] ml-auto font-mono">
                    {time}
                  </span>
                </div>
                <div className="text-sm text-[var(--color-foreground)] line-clamp-2">
                  {e.title}
                </div>
                {e.projectName && (
                  <div className="text-[10px] text-[var(--color-foreground-dim)] mt-1 truncate">
                    {e.projectName}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
