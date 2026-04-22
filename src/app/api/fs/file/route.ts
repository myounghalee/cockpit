import { NextResponse } from "next/server";
import { readTextFile } from "@/lib/fs-tree";
import path from "node:path";
import os from "node:os";

const MAX_BYTES = 1024 * 1024; // 1MB

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("path");
  if (!raw) {
    return NextResponse.json(
      { error: "path is required" },
      { status: 400 },
    );
  }

  // ~/ 확장
  let input = raw;
  if (input.startsWith("~/") || input === "~") {
    input = path.join(os.homedir(), input.slice(1));
  }

  const abs = path.resolve(input);

  // 홈 디렉토리 하위만 허용 (path traversal + 시스템 파일 접근 방지)
  const home = os.homedir();
  const rel = path.relative(home, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json(
      { error: "홈 디렉토리 하위 경로만 허용됩니다." },
      { status: 400 },
    );
  }

  try {
    const result = await readTextFile(abs, MAX_BYTES);
    return NextResponse.json({
      ...result,
      name: path.basename(abs),
      absolutePath: abs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
