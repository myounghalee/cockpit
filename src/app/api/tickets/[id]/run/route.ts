import { NextResponse } from "next/server";
import { runner } from "@/lib/claude-runner";
import { transitionIssueIfConfigured } from "@/lib/jira";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    if (runner.isRunning(id)) {
      return NextResponse.json(
        { error: "이미 실행 중입니다." },
        { status: 409 },
      );
    }
    const state = await runner.start(id);

    // Jira 상태 전환 (실패해도 진행)
    const t = await prisma.ticket.findUnique({
      where: { id },
      select: { jiraKey: true },
    });
    if (t?.jiraKey) {
      transitionIssueIfConfigured(t.jiraKey, "in_progress").catch(() => {});
    }

    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
