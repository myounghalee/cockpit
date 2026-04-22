import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runner } from "@/lib/claude-runner";
import {
  nextPdcaStage,
  type PdcaStage,
} from "@/lib/pdca-prompts";

function isPdcaStage(value: unknown): value is PdcaStage {
  return (
    value === "plan" ||
    value === "design" ||
    value === "do" ||
    value === "check" ||
    value === "report"
  );
}

/**
 * 현재 stage를 승인하고 다음 stage로 전환.
 * 다음 stage 실행에 필요한 cwd + initialInput을 반환한다.
 * 호출부(RunningTicketPanel)는 이 응답으로 터미널 탭에 초기 입력을 흘려넣어 Claude를 재실행한다.
 */
export async function POST(
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
  if (!isPdcaStage(ticket.pdcaStage)) {
    return NextResponse.json(
      { error: "not a PDCA ticket" },
      { status: 400 },
    );
  }

  const next = nextPdcaStage(ticket.pdcaStage);
  if (!next) {
    // 마지막 단계(report) 완료 — commitMode에 따라 분기:
    //   none                                     → review 유지 (사용자 수동 마무리)
    //   commit | commit_push | commit_push_pr    → done으로 전환 (사이클 종료 = 티켓 완료)
    // 어느 경우든 pdcaStage는 null로 리셋해 "Report 승인" 버튼이 다시 뜨지 않게 한다.
    const autoDone =
      ticket.commitMode === "commit" ||
      ticket.commitMode === "commit_push" ||
      ticket.commitMode === "commit_push_pr";
    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        status: autoDone ? "done" : "review",
        pdcaStage: null,
        completedAt: autoDone ? new Date() : null,
      },
    });
    return NextResponse.json({
      ticket: updated,
      stageCompleted: true,
      autoDone,
      runState: null,
    });
  }

  // 다음 stage로 전환 + 백그라운드로 즉시 실행
  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      pdcaStage: next,
      status: "in_progress",
    },
  });

  // 이미 실행 중이면 stop 후 재시작
  if (runner.isRunning(id)) {
    await runner.stop(id);
    // 짧은 여유 — 프로세스 종료 이벤트 처리 대기
    await new Promise((r) => setTimeout(r, 300));
  }

  const runState = await runner.start(id);

  return NextResponse.json({
    ticket: updated,
    stageCompleted: false,
    runState,
  });
}
