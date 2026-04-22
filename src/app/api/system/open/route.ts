import { NextResponse } from "next/server";
import path from "node:path";
import { openInSystem } from "@/lib/system-open";

interface Body {
  path?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const p = body.path?.trim();
  if (!p) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (!path.isAbsolute(p)) {
    return NextResponse.json(
      { error: "absolute path required" },
      { status: 400 },
    );
  }

  try {
    await openInSystem(p);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
