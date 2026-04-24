import { NextResponse } from "next/server";
import {
  buildDigestSummary,
  peekDigestSummaryCache,
} from "@/lib/digest-summary";

export const dynamic = "force-dynamic";
// claude -p 호출이 길어질 수 있음
export const maxDuration = 180;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 7), 1),
    365,
  );
  const refresh = url.searchParams.get("refresh") === "1";
  const cacheOnly = url.searchParams.get("cacheOnly") === "1";

  try {
    if (cacheOnly) {
      const cached = peekDigestSummaryCache(days);
      if (!cached) {
        return NextResponse.json({ cached: null }, { status: 200 });
      }
      return NextResponse.json(cached);
    }
    const result = await buildDigestSummary(days, { refresh });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
