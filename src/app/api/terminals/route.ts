import { NextResponse } from "next/server";
import { getPtyManager } from "@/server/pty-manager";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const manager = getPtyManager();
  return NextResponse.json({ terminals: manager.list() });
}

interface CreateBody {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
  projectId?: string; // 지정 시 프로젝트의 path를 cwd로 사용 (cwd가 명시되면 cwd 우선)
}

export async function POST(request: Request) {
  let body: CreateBody = {};
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    // body 없음 — 기본값 사용
  }

  // projectId로 cwd 해결
  let resolvedCwd = body.cwd;
  if (!resolvedCwd && body.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { path: true },
    });
    if (project) resolvedCwd = project.path;
  }

  // 설정된 셸 경로가 있으면 사용 (body.shell > DB 설정 > 자동 감지)
  let resolvedShell = body.shell;
  if (!resolvedShell) {
    const setting = await prisma.setting.findUnique({
      where: { key: "terminal.shellPath" },
    });
    if (setting?.value) resolvedShell = setting.value;
  }

  const manager = getPtyManager();
  const record = manager.create({
    cwd: resolvedCwd,
    shell: resolvedShell,
    cols: body.cols,
    rows: body.rows,
  });

  return NextResponse.json(
    {
      id: record.id,
      pid: record.pty.pid,
      cwd: record.cwd,
      shell: record.shell,
      createdAt: record.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
