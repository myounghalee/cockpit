import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";

/**
 * 단계별 산출물 문서(plan / design / analysis / report)를 읽어 반환.
 * 쿼리 ?type=plan|design|analysis|report
 */
const FILENAME: Record<string, string> = {
  plan: "plan.md",
  design: "design.md",
  analysis: "analysis.md",
  report: "report.md",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "plan";
  const file = FILENAME[type];
  if (!file) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { project: { select: { path: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const filePath = path.join(
    ticket.project.path,
    "docs",
    "pdca",
    ticket.jiraKey ?? id,
    file,
  );

  try {
    const content = await fs.readFile(filePath, "utf8");
    const stat = await fs.stat(filePath);
    return NextResponse.json({
      type,
      path: filePath,
      content,
      updatedAt: stat.mtime.toISOString(),
    });
  } catch {
    return NextResponse.json({
      type,
      path: null,
      content: null,
    });
  }
}
