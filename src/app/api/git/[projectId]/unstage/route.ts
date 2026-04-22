import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unstageFiles } from "@/lib/git";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: { paths?: string[] } = {};
  try {
    body = (await request.json()) as { paths?: string[] };
  } catch {}

  if (!body.paths?.length) {
    return NextResponse.json({ error: "paths required" }, { status: 400 });
  }
  try {
    await unstageFiles(project.path, body.paths);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
