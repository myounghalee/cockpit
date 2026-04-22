import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStatus } from "@/lib/git";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  try {
    const status = await getStatus(project.path);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
