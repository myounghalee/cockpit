"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RefreshCw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyResponse {
  date: string;
  content: string | null;
  dates: string[];
}

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(date: string, today: string): string {
  if (date === today) return `${date} (오늘)`;
  const d = new Date(date + "T00:00:00");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${date} (${weekday})`;
}

export function DailyTab() {
  const today = useMemo(todayKey, []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [data, setData] = useState<DailyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchDaily(date: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/insights/daily?date=${encodeURIComponent(date)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DailyResponse;
      setData(json);
    } catch (err) {
      console.warn("[daily-tab] fetch 실패:", err);
      setData({ date, content: null, dates: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDaily(selectedDate);
  }, [selectedDate]);

  const availableDates = data?.dates ?? [];

  return (
    <div className="flex-1 flex min-h-0">
      {/* 사이드: 날짜 목록 */}
      <aside className="w-48 shrink-0 border-r border-[var(--color-border)] overflow-y-auto">
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-[var(--color-foreground-dim)] border-b border-[var(--color-border)]">
          최근 기록
        </div>
        {availableDates.length === 0 && !loading && (
          <div className="p-3 text-xs text-[var(--color-foreground-dim)]">
            아직 기록된 날짜가 없어요. 티켓/메모를 만들거나 완료하면 자동으로 쌓여요.
          </div>
        )}
        {/* 오늘이 목록에 없더라도 맨 위에 고정으로 표시 */}
        <ul>
          {(availableDates.includes(today)
            ? availableDates
            : [today, ...availableDates]
          ).map((d) => (
            <li key={d}>
              <button
                onClick={() => setSelectedDate(d)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]",
                  selectedDate === d &&
                    "bg-[var(--color-surface-hover)] font-medium text-[var(--color-accent)]",
                )}
              >
                {formatDateLabel(d, today)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 본문 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
          <FileText size={13} className="text-[var(--color-foreground-dim)]" />
          <h2 className="text-xs font-medium">
            {formatDateLabel(selectedDate, today)}
          </h2>
          <div className="flex-1" />
          <button
            onClick={() => fetchDaily(selectedDate)}
            disabled={loading}
            className="h-7 px-2 rounded-md border border-[var(--color-border)] text-xs flex items-center gap-1.5 hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            title="다시 불러오기"
          >
            <RefreshCw size={12} className={cn(loading && "animate-spin")} />
            새로고침
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && !data ? (
            <div className="p-6 text-sm text-[var(--color-foreground-dim)]">
              불러오는 중…
            </div>
          ) : data?.content ? (
            <article className="prose prose-invert prose-sm max-w-3xl mx-auto p-6 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.content}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="p-6 text-sm text-[var(--color-foreground-dim)] max-w-3xl mx-auto">
              <p>
                {selectedDate === today
                  ? "오늘은 아직 기록된 활동이 없어요."
                  : "이 날짜에는 기록이 없어요."}
              </p>
              <p className="mt-2 text-xs">
                티켓을 만들거나 완료하면, 메모를 작성하거나 아카이브하면 자동으로
                이 파일에 기록돼요.
              </p>
              <p className="mt-2 text-xs">
                파일 위치:{" "}
                <code className="text-[var(--color-foreground)]">
                  ~/.cockpit-userdata/daily/{selectedDate}.md
                </code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
