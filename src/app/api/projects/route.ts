import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateProjectPath } from "@/lib/fs-tree";

export async function GET() {
  const [projects, folders] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ isFavorite: "desc" }, { order: "asc" }, { name: "asc" }],
    }),
    prisma.projectFolder.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
  ]);
  return NextResponse.json({ projects, folders });
}

interface CreateBody {
  name?: string;
  path?: string;
  folderId?: string | null;
  isFavorite?: boolean;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const inputPath = body.path?.trim();
  const inputName = body.name?.trim();
  if (!inputPath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const valid = await validateProjectPath(inputPath);
  if (!valid.ok || !valid.absolutePath) {
    return NextResponse.json(
      { error: valid.reason ?? "invalid path" },
      { status: 400 },
    );
  }

  const existing = await prisma.project.findUnique({
    where: { path: valid.absolutePath },
  });
  if (existing) {
    return NextResponse.json(
      { error: "이미 등록된 경로입니다.", existing },
      { status: 409 },
    );
  }

  const name =
    inputName || valid.absolutePath.split("/").filter(Boolean).pop() || "Project";

  const project = await prisma.project.create({
    data: {
      name,
      path: valid.absolutePath,
      folderId: body.folderId ?? null,
      isFavorite: body.isFavorite ?? false,
    },
  });
  return NextResponse.json(project, { status: 201 });
}
