import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushRemote } from "@/lib/git";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: { force?: boolean; setUpstream?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {}

  try {
    const out = await pushRemote(project.path, body);
    return NextResponse.json({ ok: true, output: out });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
