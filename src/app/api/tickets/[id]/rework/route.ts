import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendDailyEntry } from "@/lib/daily-log";

interface Body {
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // body optional
  }
  const reason = body.reason?.trim();
  try {
    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        reworkCount: { increment: 1 },
        lastReworkRequest: reason || null,
        status: "in_progress",
        completedAt: null,
      },
      include: { project: { select: { name: true } } },
    });
    appendDailyEntry({
      kind: "ticket.rework",
      title: ticket.title,
      projectName: ticket.project.name,
      jiraKey: ticket.jiraKey,
      reason: reason ?? null,
      count: ticket.reworkCount,
    });
    return NextResponse.json(ticket);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
