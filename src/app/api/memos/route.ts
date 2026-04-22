import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendDailyEntry } from "@/lib/daily-log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const includeArchived = searchParams.get("archived") === "1";
  const includeConverted = searchParams.get("converted") === "1";

  // projectId 파싱: "null" / "__all__" / 실제 id
  // - 미지정: 전체 (프로젝트별 + 전역)
  // - "null": 전역 메모만
  // - 실제 id: 해당 프로젝트만
  const where: Record<string, unknown> = {};
  if (projectId === "null") {
    where.projectId = null;
  } else if (projectId && projectId !== "__all__") {
    where.projectId = projectId;
  }
  if (!includeArchived) where.archivedAt = null;
  if (!includeConverted) where.convertedTicketId = null;

  const raw = await prisma.memo.findMany({
    where,
    include: { project: { select: { name: true } } },
    orderBy: [
      { pinnedAt: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
  });
  const memos = raw.map(({ project, ...rest }) => ({
    ...rest,
    projectName: project?.name ?? null,
  }));
  return NextResponse.json({ memos });
}

interface CreateBody {
  projectId?: string | null;
  title?: string;
  content?: string;
  tags?: string;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // projectId가 주어지면 존재 확인
  if (body.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }
  }

  const memo = await prisma.memo.create({
    data: {
      projectId: body.projectId ?? null,
      title: body.title.trim(),
      content: body.content ?? "",
      tags: body.tags?.trim() ?? "",
    },
    include: { project: { select: { name: true } } },
  });
  appendDailyEntry({
    kind: "memo.created",
    title: memo.title,
    projectName: memo.project?.name ?? null,
    tags: memo.tags,
  });
  return NextResponse.json(memo, { status: 201 });
}
