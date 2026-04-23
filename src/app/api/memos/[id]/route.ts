import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendDailyEntry } from "@/lib/daily-log";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const memo = await prisma.memo.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true, path: true } } },
  });
  if (!memo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(memo);
}

interface PatchBody {
  title?: string;
  content?: string;
  tags?: string;
  projectId?: string | null;
  pinned?: boolean;     // true → pinnedAt=now, false → pinnedAt=null
  archived?: boolean;   // true → archivedAt=now, false → archivedAt=null
  completed?: boolean;  // true → completedAt=now, false → completedAt=null
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

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.content !== undefined) data.content = body.content;
  if (body.tags !== undefined) data.tags = body.tags.trim();
  if (body.projectId !== undefined) data.projectId = body.projectId;
  if (body.pinned !== undefined) {
    data.pinnedAt = body.pinned ? new Date() : null;
  }
  if (body.archived !== undefined) {
    data.archivedAt = body.archived ? new Date() : null;
  }
  if (body.completed !== undefined) {
    data.completedAt = body.completed ? new Date() : null;
  }

  try {
    // 전환 여부 판정을 위해 이전 값 한 번 조회 (archive/complete 둘 다 필요할 수 있음)
    const needsBefore =
      body.archived === true || body.completed === true;
    const before = needsBefore
      ? await prisma.memo.findUnique({
          where: { id },
          select: { archivedAt: true, completedAt: true },
        })
      : null;
    const updated = await prisma.memo.update({
      where: { id },
      data,
      include: { project: { select: { name: true } } },
    });
    // complete 토글 true → completedAt이 새로 생긴 경우에만 기록
    if (body.completed === true && before && before.completedAt === null) {
      appendDailyEntry({
        kind: "memo.completed",
        title: updated.title,
        projectName: updated.project?.name ?? null,
      });
    }
    // archive 토글 true → archivedAt이 새로 생긴 경우에만 기록
    if (body.archived === true && before && before.archivedAt === null) {
      appendDailyEntry({
        kind: "memo.archived",
        title: updated.title,
        projectName: updated.project?.name ?? null,
      });
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
    await prisma.memo.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
