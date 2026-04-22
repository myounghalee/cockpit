import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listStash,
  stashApply,
  stashDrop,
  stashPop,
  stashSave,
} from "@/lib/git";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  try {
    const stashes = await listStash(project.path);
    return NextResponse.json({ stashes });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: {
    action?: "save" | "pop" | "drop" | "apply";
    message?: string;
    index?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "save":
        await stashSave(project.path, body.message);
        break;
      case "pop":
        await stashPop(project.path, body.index);
        break;
      case "drop":
        if (typeof body.index !== "number")
          return NextResponse.json(
            { error: "index required for drop" },
            { status: 400 },
          );
        await stashDrop(project.path, body.index);
        break;
      case "apply":
        if (typeof body.index !== "number")
          return NextResponse.json(
            { error: "index required for apply" },
            { status: 400 },
          );
        await stashApply(project.path, body.index);
        break;
      default:
        return NextResponse.json(
          { error: "invalid action" },
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
