import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CalendarEvent } from "@/types/calendar";

/**
 * 특정 기간의 이벤트를 티켓/메모에서 집계해 반환.
 *
 * Query:
 *   from       ISO datetime (inclusive)   기본: 30일 전
 *   to         ISO datetime (inclusive)   기본: 지금
 *   projectId  특정 프로젝트만. 미지정 = 전체
 *
 * 한 티켓은 최대 3개 이벤트(생성/시작/완료)를 만든다.
 * 한 메모는 1개 이벤트(생성)만.
 * 결과는 timestamp 내림차순.
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

  // 기간이 말 안 되면 400
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json(
      { error: "invalid from/to range" },
      { status: 400 },
    );
  }

  const projectFilter = projectId ? { projectId } : {};

  // 티켓: 세 날짜 필드 중 하나라도 기간 안에 있으면 해당 티켓을 가져와서 이벤트 분해
  const tickets = await prisma.ticket.findMany({
    where: {
      ...projectFilter,
      OR: [
        { createdAt: { gte: from, lte: to } },
        { startedAt: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
      ],
    },
    include: { project: { select: { name: true } } },
  });

  // 메모: createdAt만 이벤트 (수정은 이벤트 안 만듦 — 너무 빈번)
  const memos = await prisma.memo.findMany({
    where: {
      // 메모는 projectId가 null일 수도 있어 projectFilter 대신 조건 분기
      ...(projectId ? { projectId } : {}),
      createdAt: { gte: from, lte: to },
      // 티켓으로 변환된 메모는 제외 (중복 느낌)
      convertedTicketId: null,
    },
    include: { project: { select: { name: true } } },
  });

  const events: CalendarEvent[] = [];

  for (const t of tickets) {
    const base = {
      title: t.title,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      ticketId: t.id,
      pdcaStage: t.pdcaStage ?? null,
    };

    if (t.createdAt >= from && t.createdAt <= to) {
      events.push({
        id: `ticket-${t.id}-created`,
        type: "ticket_created",
        timestamp: t.createdAt.toISOString(),
        ...base,
      });
    }
    if (t.startedAt && t.startedAt >= from && t.startedAt <= to) {
      events.push({
        id: `ticket-${t.id}-started`,
        type: "ticket_started",
        timestamp: t.startedAt.toISOString(),
        ...base,
      });
    }
    if (t.completedAt && t.completedAt >= from && t.completedAt <= to) {
      events.push({
        id: `ticket-${t.id}-completed`,
        type: "ticket_completed",
        timestamp: t.completedAt.toISOString(),
        ...base,
      });
    }
  }

  for (const m of memos) {
    events.push({
      id: `memo-${m.id}-created`,
      type: "memo_created",
      timestamp: m.createdAt.toISOString(),
      title: m.title,
      projectId: m.projectId,
      projectName: m.project?.name ?? null,
      memoId: m.id,
    });
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return NextResponse.json({ events });
}
