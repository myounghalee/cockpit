import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { commitChanges } from "@/lib/git";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: { message?: string; amend?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const hash = await commitChanges(
      project.path,
      body.message ?? "",
      body.amend ?? false,
    );
    return NextResponse.json({ ok: true, hash });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
