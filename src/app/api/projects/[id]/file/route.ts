import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readTextFile } from "@/lib/fs-tree";
import path from "node:path";

const MAX_BYTES = 1024 * 1024; // 1MB

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
  const rel = searchParams.get("path");
  if (!rel) {
    return NextResponse.json(
      { error: "path is required" },
      { status: 400 },
    );
  }

  // 프로젝트 루트 하위인지 검증
  const root = path.resolve(project.path);
  const abs = path.resolve(root, rel);
  const relCheck = path.relative(root, abs);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    return NextResponse.json(
      { error: "path traversal forbidden" },
      { status: 400 },
    );
  }

  try {
    const result = await readTextFile(abs, MAX_BYTES);
    return NextResponse.json({
      ...result,
      name: path.basename(abs),
      absolutePath: abs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
