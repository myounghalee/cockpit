import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAll } from "@/lib/git";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  try {
    const out = await fetchAll(project.path);
    return NextResponse.json({ ok: true, output: out });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
