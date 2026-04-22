import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAutoTransitionDone,
  transitionIssueIfConfigured,
} from "@/lib/jira";
import { appendDailyEntry } from "@/lib/daily-log";

interface PatchBody {
  title?: string;
  description?: string | null;
  type?: string;
  successCriteria?: string | null;
  priority?: number;
  jiraKey?: string | null;
  status?: string;
  order?: number;
  sessionId?: string | null;
  completedAt?: string | null;
  resultSummary?: string | null;
  pdcaStage?: string | null;
  autoMode?: string;
  commitMode?: string;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    // status가 "done"으로 변경되면 completedAt 자동 세팅
    const data: Record<string, unknown> = { ...body };
    if (body.status === "done") {
      data.completedAt = new Date();
    } else if (body.status !== undefined && body.status !== "done") {
      data.completedAt = null;
    }
    const before =
      body.status !== undefined
        ? await prisma.ticket.findUnique({
            where: { id },
            select: { status: true },
          })
        : null;
    const updated = await prisma.ticket.update({
      where: { id },
      data,
      include: { project: { select: { name: true } } },
    });

    // daily.md 기록 — status 전환 시에만
    if (body.status !== undefined && before?.status !== body.status) {
      if (body.status === "done") {
        appendDailyEntry({
          kind: "ticket.done",
          title: updated.title,
          projectName: updated.project.name,
          jiraKey: updated.jiraKey,
          resultSummary:
            (body.resultSummary as string | undefined) ?? updated.resultSummary,
        });
      } else {
        appendDailyEntry({
          kind: "ticket.status",
          title: updated.title,
          projectName: updated.project.name,
          jiraKey: updated.jiraKey,
          from: before?.status ?? null,
          to: body.status,
        });
      }
    }

    // 완료 상태 전환 + autoTransitionDone + jiraKey 있으면 Jira done 전환 (실패해도 티켓 진행)
    if (body.status === "done" && updated.jiraKey) {
      const auto = await getAutoTransitionDone();
      if (auto) {
        try {
          await transitionIssueIfConfigured(updated.jiraKey, "done");
        } catch (err) {
          console.warn("[jira] done transition 실패:", (err as Error).message);
        }
      }
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.ticket.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
