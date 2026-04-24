import { NextResponse } from "next/server";
import { buildDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 7), 1),
    365,
  );
  try {
    const result = await buildDigest(days);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
