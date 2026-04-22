import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommitDetail } from "@/lib/git";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; hash: string }> },
) {
  const { projectId, hash } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  try {
    const detail = await getCommitDetail(project.path, hash);
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
