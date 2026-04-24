import { NextResponse } from "next/server";
import { buildDigestSummary } from "@/lib/digest-summary";

export const dynamic = "force-dynamic";
// claude -p 호출이 길어질 수 있음
export const maxDuration = 180;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 7), 1),
    365,
  );
  try {
    const result = await buildDigestSummary(days);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
