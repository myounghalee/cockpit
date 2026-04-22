import { NextResponse } from "next/server";
import { runner } from "@/lib/claude-runner";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const killed = await runner.stop(id);
  if (!killed) {
    // 이미 실행 중이 아닌 경우, status만 review로 강제
    try {
      await prisma.ticket.update({
        where: { id },
        data: { status: "review" },
      });
    } catch {
      // 티켓 없음
    }
  }
  return NextResponse.json({ ok: true, killed });
}
