import { NextResponse } from "next/server";
import {
  appendDailyEntry,
  listDailyDates,
  readDailyFile,
  todayKey,
} from "@/lib/daily-log";

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
  tags?: string;
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
  appendDailyEntry({
    kind: "activity",
    title: body.title.trim(),
    details: body.details ?? null,
    projectName: body.projectName ?? null,
    tags: body.tags,
  });
  return NextResponse.json({ ok: true, date: todayKey() }, { status: 201 });
}
