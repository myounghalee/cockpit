import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBranch, deleteRemoteBranch } from "@/lib/git";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; name: string }> },
) {
  const { projectId, name } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const remote = searchParams.get("remote") === "1";

  try {
    if (remote) {
      await deleteRemoteBranch(project.path, name);
    } else {
      await deleteBranch(project.path, name, force);
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
