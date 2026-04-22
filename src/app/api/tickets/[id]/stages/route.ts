import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";

const STAGE_FILES = [
  { stage: "plan", file: "plan.md" },
  { stage: "design", file: "design.md" },
  { stage: "do", file: "do.md" }, // 선택적 — 대부분 design.md 체크리스트로 대체됨
  { stage: "check", file: "analysis.md" },
  { stage: "report", file: "report.md" },
] as const;

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

  const dir = path.join(
    ticket.project.path,
    "docs",
    "pdca",
    ticket.jiraKey ?? id,
  );

  const stages = await Promise.all(
    STAGE_FILES.map(async ({ stage, file }) => {
      const filePath = path.join(dir, file);
      try {
        const stat = await fs.stat(filePath);
        return {
          stage,
          file,
          exists: true,
          path: filePath,
          updatedAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      } catch {
        return { stage, file, exists: false, path: null, updatedAt: null };
      }
    }),
  );

  return NextResponse.json({
    ticketId: id,
    currentStage: ticket.pdcaStage,
    dir,
    stages,
  });
}
