import { NextResponse } from "next/server";
import { browseHomeDirectory } from "@/lib/fs-tree";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const p = searchParams.get("path") ?? undefined;

  try {
    const result = await browseHomeDirectory(p);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
