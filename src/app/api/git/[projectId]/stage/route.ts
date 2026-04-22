import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stageAll, stageFiles } from "@/lib/git";

interface Body {
  paths?: string[];
  all?: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // 빈 body OK (all=true 대체 가능)
  }

  try {
    if (body.all) {
      await stageAll(project.path);
    } else if (body.paths?.length) {
      await stageFiles(project.path, body.paths);
    } else {
      return NextResponse.json(
        { error: "paths or all is required" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
