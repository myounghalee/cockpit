import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readTextFile } from "@/lib/fs-tree";
import path from "node:path";
import fs from "node:fs/promises";

const MAX_BYTES = 1024 * 1024; // 1MB

// 뷰어가 직접 <img> 로 렌더할 수 있는 이미지 포맷.
const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
  ".svg",
]);
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const rel = searchParams.get("path");
  if (!rel) {
    return NextResponse.json(
      { error: "path is required" },
      { status: 400 },
    );
  }

  // 프로젝트 루트 하위인지 검증
  const root = path.resolve(project.path);
  const abs = path.resolve(root, rel);
  const relCheck = path.relative(root, abs);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    return NextResponse.json(
      { error: "path traversal forbidden" },
      { status: 400 },
    );
  }

  const name = path.basename(abs);
  const ext = path.extname(abs).toLowerCase();

  try {
    // 이미지 파일은 base64 dataUrl로 반환해서 <img src>에 바로 붙일 수 있게.
    if (IMAGE_EXTS.has(ext)) {
      const st = await fs.stat(abs);
      if (!st.isFile()) throw new Error("not a file");
      if (st.size > MAX_BYTES) {
        return NextResponse.json({
          binary: true,
          oversize: true,
          size: st.size,
          name,
          absolutePath: abs,
        });
      }
      const buf = await fs.readFile(abs);
      const mime = IMAGE_MIME[ext] ?? "application/octet-stream";
      return NextResponse.json({
        binary: false,
        oversize: false,
        size: st.size,
        image: true,
        dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
        mimeType: mime,
        name,
        absolutePath: abs,
      });
    }

    const result = await readTextFile(abs, MAX_BYTES);
    return NextResponse.json({
      ...result,
      name,
      absolutePath: abs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
