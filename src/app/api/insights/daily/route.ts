import { NextResponse } from "next/server";
import {
  appendDailyEntry,
  listDailyDates,
  readDailyFile,
  todayKey,
} from "@/lib/daily-log";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/insights/daily?date=YYYY-MM-DD
 *   - date 미지정 시 오늘
 *   - 응답: { date, content, dates[] }  (dates: 최근 60일 중 파일 존재 날짜)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("date");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? requested
    : todayKey();

  const content = readDailyFile(date);
  const dates = listDailyDates(60);
  return NextResponse.json({ date, content, dates });
}

/**
 * POST /api/insights/daily
 *   body: { title, details?, projectName?, tags? }
 *   - 자유 형식 "활동" 로그를 오늘자 daily.md 에 한 줄 추가.
 *   - MCP/외부 도구(Claude Code 등)에서 "작업했다" 기록용.
 */
interface ActivityBody {
  title?: string;
  details?: string | null;
  projectName?: string | null;
  /** Claude Code 훅처럼 cwd 만 알 때 — projectName 미지정 시 path 매칭으로 보강. */
  cwd?: string | null;
  tags?: string;
}

async function resolveProjectName(cwd: string): Promise<string | null> {
  try {
    const project = await prisma.project.findUnique({
      where: { path: cwd },
      select: { name: true },
    });
    return project?.name ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: ActivityBody;
  try {
    body = (await request.json()) as ActivityBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  let projectName = body.projectName?.trim() || null;
  if (!projectName && body.cwd?.trim()) {
    projectName = await resolveProjectName(body.cwd.trim());
  }

  appendDailyEntry({
    kind: "activity",
    title: body.title.trim(),
    details: body.details ?? null,
    projectName,
    tags: body.tags,
  });
  return NextResponse.json({ ok: true, date: todayKey() }, { status: 201 });
}
