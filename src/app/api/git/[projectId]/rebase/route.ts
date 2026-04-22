import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebaseOnto } from "@/lib/git";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: { onto?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.onto) {
    return NextResponse.json({ error: "onto is required" }, { status: 400 });
  }

  try {
    const out = await rebaseOnto(project.path, body.onto);
    return NextResponse.json({ ok: true, output: out });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
