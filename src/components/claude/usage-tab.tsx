"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";

interface DailyRow {
  date: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  sessions: number;
}

interface UsageResponse {
  rangeDays: number;
  today: DailyRow;
  rangeSum: DailyRow;
  daily: DailyRow[];
  totalSessions: number;
}

type RangeKey = "7d" | "30d" | "90d";
const RANGES: Record<RangeKey, { label: string; days: number }> = {
  "7d": { label: "7일", days: 7 },
  "30d": { label: "30일", days: 30 },
  "90d": { label: "90일", days: 90 },
};

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(2) + "M";
}

export function UsageTab() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(r: RangeKey) {
    setLoading(true);
    try {
      const days = RANGES[r].days;
      const res = await fetch(`/api/claude/usage?days=${days}`);
      const json = (await res.json()) as UsageResponse;
      setData(json);
    } catch (err) {
      console.warn("[usage-tab] 로드 실패:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(range);
  }, [range]);

  const maxTotal = useMemo(() => {
    if (!data || data.daily.length === 0) return 0;
    return Math.max(...data.daily.map((d) => d.total));
  }, [data]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={
                "text-xs px-2.5 h-7 " +
                (range === k
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]")
              }
            >
              {RANGES[k].label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
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
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="오늘 토큰" value={fmt(data?.today.total ?? 0)} sub={`${data?.today.sessions ?? 0} 세션`} />
          <SummaryCard
            label={`최근 ${RANGES[range].label} 토큰`}
            value={fmt(data?.rangeSum.total ?? 0)}
            sub={`${data?.rangeSum.sessions ?? 0} 세션`}
          />
          <SummaryCard label="입력/출력" value={`${fmt(data?.rangeSum.input ?? 0)} / ${fmt(data?.rangeSum.output ?? 0)}`} sub="실 소모" />
          <SummaryCard
            label="캐시 생성/조회"
            value={`${fmt(data?.rangeSum.cacheCreate ?? 0)} / ${fmt(data?.rangeSum.cacheRead ?? 0)}`}
            sub="prompt cache"
          />
        </div>

        {/* 일자별 막대 */}
        <div className="rounded-md border border-[var(--color-border)]">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)]">
            <TrendingUp size={12} />
            일자별 토큰
          </div>
          <div className="p-3">
            {!data || data.daily.length === 0 ? (
              <div className="text-sm text-[var(--color-foreground-dim)] text-center py-6">
                데이터 없음
              </div>
            ) : (
              <div className="space-y-1">
                {data.daily.map((row) => {
                  const pct = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;
                  return (
                    <div key={row.date} className="flex items-center gap-2 text-xs">
                      <div className="w-20 font-mono text-[var(--color-foreground-dim)]">
                        {row.date.slice(5)}
                      </div>
                      <div className="flex-1 h-4 bg-[var(--color-surface)] rounded overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-accent)]/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-20 text-right font-mono">{fmt(row.total)}</div>
                      <div className="w-12 text-right text-[var(--color-foreground-dim)]">
                        {row.sessions}s
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="text-[11px] text-[var(--color-foreground-dim)] px-1">
          ⚠️ 구독 quota 잔량은 로컬에 저장되지 않아 여기서 표시할 수 없어요. 여기 값은{" "}
          <code className="font-mono">~/.claude/projects/</code> transcript 에서
          누적 집계한 &lsquo;사용량&rsquo; 기준입니다.
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <div className="text-[11px] text-[var(--color-foreground-dim)] mb-1">
        {label}
      </div>
      <div className="text-lg font-semibold font-mono">{value}</div>
      {sub && (
        <div className="text-[11px] text-[var(--color-foreground-dim)] mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}
