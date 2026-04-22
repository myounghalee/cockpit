import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { project: { select: { path: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const projectPath = ticket.project.path;
  // PDCA 스킬은 docs/pdca/{ticket-id}/plan.md 에 기록.
  // jiraKey 연동 티켓은 jiraKey 기반 폴더를 쓸 수 있어 둘 다 확인.
  const candidates = [
    ticket.jiraKey
      ? path.join(projectPath, "docs", "pdca", ticket.jiraKey, "plan.md")
      : null,
    path.join(projectPath, "docs", "pdca", id, "plan.md"),
  ].filter((p): p is string => !!p);

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const stat = await fs.stat(filePath);
      return NextResponse.json({
        path: filePath,
        content,
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      // 다음 후보 시도
    }
  }

  return NextResponse.json({ path: null, content: null });
}
