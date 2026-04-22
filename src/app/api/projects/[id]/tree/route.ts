import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readTree } from "@/lib/fs-tree";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const subPath = searchParams.get("path") ?? undefined;
  const depthRaw = searchParams.get("depth");
  const depth = depthRaw ? Math.max(1, Math.min(3, Number(depthRaw) || 1)) : 1;

  try {
    const nodes = await readTree({
      projectRoot: project.path,
      subPath: subPath && subPath !== "/" ? subPath : undefined,
      depth,
    });
    return NextResponse.json({ nodes });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
