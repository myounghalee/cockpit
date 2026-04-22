import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendDailyEntry } from "@/lib/daily-log";

interface PatchBody {
  title?: string;
  content?: string;
  tags?: string;
  projectId?: string | null;
  pinned?: boolean;     // true → pinnedAt=now, false → pinnedAt=null
  archived?: boolean;   // true → archivedAt=now, false → archivedAt=null
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

  try {
    const before =
      body.archived === true
        ? await prisma.memo.findUnique({
            where: { id },
            select: { archivedAt: true },
          })
        : null;
    const updated = await prisma.memo.update({
      where: { id },
      data,
      include: { project: { select: { name: true } } },
    });
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
