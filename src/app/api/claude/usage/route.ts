import { NextResponse } from "next/server";
import { aggregateUsageByDay, listSessions } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 30), 1),
    365,
  );

  const daily = aggregateUsageByDay(days);

  // 요약 카드용 — 오늘 / 어제 / 전체 범위 합계
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = daily.find((d) => d.date === todayKey) ?? {
    date: todayKey,
    input: 0,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
    total: 0,
    sessions: 0,
  };

  const sum = daily.reduce(
    (acc, d) => {
      acc.input += d.input;
      acc.output += d.output;
      acc.cacheCreate += d.cacheCreate;
      acc.cacheRead += d.cacheRead;
      acc.total += d.total;
      acc.sessions += d.sessions;
      return acc;
    },
    { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, sessions: 0 },
  );

  // 최근 세션 전반 통계 (총 세션 수 등)
  const allSessions = listSessions(5000);

  return NextResponse.json({
    rangeDays: days,
    today,
    rangeSum: sum,
    daily,
    totalSessions: allSessions.length,
  });
}
