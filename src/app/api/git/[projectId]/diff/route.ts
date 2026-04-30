import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileDiff, parseDiffMeta, parseUnifiedDiff } from "@/lib/git";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const commit = searchParams.get("commit") ?? undefined;
  const staged = searchParams.get("staged") === "1";
  const untracked = searchParams.get("untracked") === "1";

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const { text, size, oversize } = await getFileDiff(project.path, {
      commit,
      path,
      staged,
      untracked,
    });
    const hunks = oversize ? [] : parseUnifiedDiff(text);
    const meta = oversize
      ? { isNew: false, isDeleted: false, isBinary: false, isRename: false }
      : parseDiffMeta(text);
    // untracked는 항상 새 파일로 취급 (헤더에 'new file mode'가 없을 수 있음)
    if (untracked) meta.isNew = true;
    return NextResponse.json({ oversize, size, hunks, meta });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
