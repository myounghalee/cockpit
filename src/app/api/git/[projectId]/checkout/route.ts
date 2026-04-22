import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkoutBranch, getStatus } from "@/lib/git";

interface Body {
  branch?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.branch) {
    return NextResponse.json({ error: "branch is required" }, { status: 400 });
  }

  try {
    await checkoutBranch(project.path, body.branch);
    const status = await getStatus(project.path);
    return NextResponse.json({ ok: true, currentBranch: status.currentBranch });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
