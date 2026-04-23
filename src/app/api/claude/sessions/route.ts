import { NextResponse } from "next/server";
import { listSessions } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 50), 1),
    500,
  );
  const projectDir = url.searchParams.get("projectDir");

  let sessions = listSessions(limit * 4); // 필터용 여유
  if (projectDir) {
    sessions = sessions.filter((s) => s.projectDir === projectDir);
  }
  sessions = sessions.slice(0, limit);

  return NextResponse.json({ sessions });
}
