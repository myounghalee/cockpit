import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { InsightsStats } from "@/types/insights";

const TYPE_COLORS: Record<string, string> = {
  feature: "#8b5cf6",
  bug: "#ef4444",
  improvement: "#10b981",
  check: "#f59e0b",
};

const STATUS_COLORS: Record<string, string> = {
  backlog: "#6b7280",
  in_progress: "#8b5cf6",
  review: "#f59e0b",
  done: "#10b981",
};

const TYPE_LABELS: Record<string, string> = {
  feature: "기능",
  bug: "버그",
  improvement: "개선",
  check: "점검",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "대기",
  in_progress: "진행중",
  review: "리뷰",
  done: "완료",
};

/** YYYY-MM-DD local date string */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 지정 기간의 집계/분포/일별 추이 통계.
 *
 * Query:
 *   from       ISO datetime (inclusive)   기본: 30일 전
 *   to         ISO datetime (inclusive)   기본: 지금
 *   projectId  특정 프로젝트만. 미지정 = 전체
 *
 * 집계는 "기간 내 생성/시작/완료" 기준.
 * byStatus는 현재 스냅샷 (티켓이 지금 어느 상태인가)이라 기간 필터 적용하되
 * 기간 내 어떤 활동이 있었던 티켓만 포함.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const projectId = searchParams.get("projectId");

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  const projectFilter = projectId ? { projectId } : {};

  // 기간에 한 번이라도 touch된 티켓 (생성/시작/완료)
  const tickets = await prisma.ticket.findMany({
    where: {
      ...projectFilter,
      OR: [
        { createdAt: { gte: from, lte: to } },
        { startedAt: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
      ],
    },
    include: { project: { select: { id: true, name: true } } },
  });

  const memos = await prisma.memo.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      createdAt: { gte: from, lte: to },
      convertedTicketId: null,
    },
    select: {
      id: true,
      createdAt: true,
      projectId: true,
    },
  });

  // 합계
  let ticketsCreated = 0;
  let ticketsStarted = 0;
  let ticketsCompleted = 0;
  const completionDurationsMs: number[] = [];

  for (const t of tickets) {
    if (t.createdAt >= from && t.createdAt <= to) ticketsCreated++;
    if (t.startedAt && t.startedAt >= from && t.startedAt <= to) ticketsStarted++;
    if (t.completedAt && t.completedAt >= from && t.completedAt <= to) {
      ticketsCompleted++;
      if (t.startedAt) {
        completionDurationsMs.push(
          t.completedAt.getTime() - t.startedAt.getTime(),
        );
      }
    }
  }

  const averageCompletionHours =
    completionDurationsMs.length > 0
      ? completionDurationsMs.reduce((a, b) => a + b, 0) /
        completionDurationsMs.length /
        3_600_000
      : null;

  // byType: 기간 내 생성된 티켓 기준
  const typeCount: Record<string, number> = {};
  for (const t of tickets) {
    if (t.createdAt >= from && t.createdAt <= to) {
      typeCount[t.type] = (typeCount[t.type] ?? 0) + 1;
    }
  }
  const byType = Object.entries(typeCount)
    .map(([type, value]) => ({
      label: TYPE_LABELS[type] ?? type,
      value,
      color: TYPE_COLORS[type] ?? "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);

  // byStatus: 기간 내 활동이 있던 티켓들의 현재 상태
  const statusCount: Record<string, number> = {};
  for (const t of tickets) {
    statusCount[t.status] = (statusCount[t.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusCount)
    .map(([status, value]) => ({
      label: STATUS_LABELS[status] ?? status,
      value,
      color: STATUS_COLORS[status] ?? "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);

  // byProject: 기간 내 생성된 티켓 수 기준 Top
  const projectCount = new Map<
    string,
    { projectId: string; name: string; count: number }
  >();
  for (const t of tickets) {
    if (t.createdAt < from || t.createdAt > to) continue;
    const pid = t.projectId;
    const entry = projectCount.get(pid) ?? {
      projectId: pid,
      name: t.project?.name ?? "(unknown)",
      count: 0,
    };
    entry.count++;
    projectCount.set(pid, entry);
  }
  const byProject = Array.from(projectCount.values()).sort(
    (a, b) => b.count - a.count,
  );

  // dailyCounts: 기간 전체 일자를 순회해서 그 날 생성된 티켓/메모 수
  const dailyMap = new Map<string, { tickets: number; memos: number }>();
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    dailyMap.set(dateKey(d), { tickets: 0, memos: 0 });
  }
  for (const t of tickets) {
    if (t.createdAt < from || t.createdAt > to) continue;
    const k = dateKey(t.createdAt);
    const entry = dailyMap.get(k);
    if (entry) entry.tickets++;
  }
  for (const m of memos) {
    const k = dateKey(m.createdAt);
    const entry = dailyMap.get(k);
    if (entry) entry.memos++;
  }
  const dailyCounts = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    tickets: v.tickets,
    memos: v.memos,
  }));

  const result: InsightsStats = {
    totals: {
      ticketsCreated,
      ticketsStarted,
      ticketsCompleted,
      memosCreated: memos.length,
      averageCompletionHours,
    },
    byType,
    byStatus,
    byProject,
    dailyCounts,
  };

  return NextResponse.json(result);
}
