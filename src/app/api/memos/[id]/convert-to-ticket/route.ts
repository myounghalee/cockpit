import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendDailyEntry } from "@/lib/daily-log";

interface ConvertBody {
  projectId?: string;  // 메모가 전역이면 여기서 프로젝트 지정 필수
  autoMode?: string;   // manual | after_plan | full
  commitMode?: string; // none | commit | commit_push
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: ConvertBody = {};
  try {
    body = (await request.json()) as ConvertBody;
  } catch {
    // body 없어도 OK (전부 기본값)
  }

  const memo = await prisma.memo.findUnique({ where: { id } });
  if (!memo) {
    return NextResponse.json({ error: "memo not found" }, { status: 404 });
  }
  if (memo.convertedTicketId) {
    return NextResponse.json(
      { error: "memo already converted", ticketId: memo.convertedTicketId },
      { status: 409 },
    );
  }

  // projectId 결정 — 메모의 projectId 우선, 없으면 body에서
  const projectId = memo.projectId ?? body.projectId;
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required (memo has no project)" },
      { status: 400 },
    );
  }

  // project 존재 확인
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // backlog의 최대 order + 1로 추가
  const maxOrder = await prisma.ticket.aggregate({
    where: { projectId, status: "backlog" },
    _max: { order: true },
  });

  // 타입 추론 — 태그에서 힌트
  const tagList = memo.tags
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  let type = "feature";
  if (tagList.some((t) => ["bug", "버그"].includes(t))) type = "bug";
  else if (tagList.some((t) => ["improvement", "개선"].includes(t)))
    type = "improvement";

  // 트랜잭션: 티켓 생성 + 메모 업데이트
  const [ticket] = await prisma.$transaction([
    prisma.ticket.create({
      data: {
        projectId,
        title: memo.title,
        description: memo.content || null,
        type,
        status: "backlog",
        order: (maxOrder._max.order ?? 0) + 1,
        pdcaStage: "plan",
        autoMode: body.autoMode ?? "manual",
        commitMode: body.commitMode ?? "none",
      },
    }),
    // Prisma는 한 트랜잭션 안에서 단일 row 업데이트 뒤 다른 row 참조 불가
    // → 일단 ticket만 만들고, convertedTicketId는 트랜잭션 밖에서 업데이트
  ]);

  await prisma.memo.update({
    where: { id: memo.id },
    data: { convertedTicketId: ticket.id },
  });

  appendDailyEntry({
    kind: "memo.converted",
    title: memo.title,
    projectName: project.name,
    ticketId: ticket.id,
  });

  return NextResponse.json({ ticket, memoId: memo.id }, { status: 201 });
}
