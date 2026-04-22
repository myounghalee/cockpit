import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface PatchBody {
  name?: string;
  collapsed?: boolean;
  order?: number;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const updated = await prisma.projectFolder.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.collapsed !== undefined ? { collapsed: body.collapsed } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    // Prisma의 onDelete: SetNull 덕분에 소속 프로젝트들은 자동으로 folderId null 처리
    await prisma.projectFolder.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
