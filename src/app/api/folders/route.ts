import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface CreateFolderBody {
  name?: string;
}

export async function POST(request: Request) {
  let body: CreateFolderBody;
  try {
    body = (await request.json()) as CreateFolderBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const maxOrder = await prisma.projectFolder.aggregate({
    _max: { order: true },
  });
  const folder = await prisma.projectFolder.create({
    data: {
      name,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(folder, { status: 201 });
}
