import { NextResponse } from "next/server";
import { chatWithDigest } from "@/lib/digest-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      days?: number;
      message?: string;
    };
    const days = Math.min(Math.max(Number(body.days ?? 7), 1), 365);
    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json(
        { error: "message 비어있음" },
        { status: 400 },
      );
    }
    const result = await chatWithDigest(days, message);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
