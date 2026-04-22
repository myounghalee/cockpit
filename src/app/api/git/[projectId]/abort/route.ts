import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { abortOp } from "@/lib/git";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: { op?: "merge" | "rebase" } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.op !== "merge" && body.op !== "rebase") {
    return NextResponse.json({ error: "op must be merge|rebase" }, { status: 400 });
  }

  try {
    await abortOp(project.path, body.op);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
