import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSteps, type Step } from "@/lib/quick-action-runner";

export async function POST(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; actionId: string }>;
  },
) {
  const { projectId, actionId } = await params;
  const [project, action] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.quickAction.findUnique({ where: { id: actionId } }),
  ]);
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  if (!action)
    return NextResponse.json({ error: "action not found" }, { status: 404 });

  let steps: Step[];
  try {
    steps = JSON.parse(action.steps) as Step[];
    if (!Array.isArray(steps)) throw new Error("steps must be array");
  } catch (err) {
    return NextResponse.json(
      { error: `invalid steps: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const result = await runSteps(project.path, steps);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
