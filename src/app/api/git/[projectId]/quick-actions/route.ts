import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  // 프로젝트 소속 + 전역(null) 둘 다 반환
  const actions = await prisma.quickAction.findMany({
    where: {
      OR: [{ projectId }, { projectId: null }],
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ actions });
}

interface CreateBody {
  name?: string;
  icon?: string;
  steps?: unknown[];
  global?: boolean; // true면 projectId null로 저장
  order?: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const stepsJson = JSON.stringify(body.steps ?? []);

  const maxOrder = await prisma.quickAction.aggregate({
    where: body.global
      ? { projectId: null }
      : { projectId },
    _max: { order: true },
  });

  const action = await prisma.quickAction.create({
    data: {
      projectId: body.global ? null : projectId,
      name: body.name.trim(),
      icon: body.icon,
      steps: stepsJson,
      order: body.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(action, { status: 201 });
}
