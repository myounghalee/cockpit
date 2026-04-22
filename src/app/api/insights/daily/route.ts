import { NextResponse } from "next/server";
import {
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
