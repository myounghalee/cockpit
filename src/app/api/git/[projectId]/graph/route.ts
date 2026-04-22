import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommitGraph } from "@/lib/git";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "500");
  // ?allBranches=false 이면 현재 HEAD 브랜치만 (기본은 모든 브랜치)
  const allBranches = searchParams.get("allBranches") !== "false";

  try {
    const commits = await getCommitGraph(project.path, limit, allBranches);
    return NextResponse.json({ commits });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
