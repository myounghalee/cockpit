import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * "Claude 열기" 버튼 전용 — 터미널 탭에서 같은 세션을 이어가기 위한 정보 반환.
 * 백그라운드 runner는 `-p` 모드로 돌지만, 사용자가 직접 대화형으로 이어가고 싶을 때 사용.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { project: { select: { path: true, name: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const resume = ticket.sessionId ? ` --resume ${ticket.sessionId}` : "";
  const command = `claude${resume} --dangerously-skip-permissions\r`;

  return NextResponse.json({
    cwd: ticket.project.path,
    projectName: ticket.project.name,
    sessionId: ticket.sessionId,
    command,
  });
}
