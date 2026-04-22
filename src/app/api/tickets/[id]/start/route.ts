import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildClaudePrompt, buildClaudeCommand } from "@/lib/claude-prompt";
import { transitionIssueIfConfigured } from "@/lib/jira";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { project: { select: { id: true, path: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 상태 전환 + startedAt
  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      status: "in_progress",
      startedAt: ticket.startedAt ?? new Date(),
    },
  });

  // Claude 명령 조립
  const prompt = buildClaudePrompt(ticket);
  const initialInput = buildClaudeCommand(prompt, ticket.sessionId);

  // Jira 상태 전환 (실패해도 티켓 진행)
  if (ticket.jiraKey) {
    try {
      await transitionIssueIfConfigured(ticket.jiraKey, "in_progress");
    } catch (err) {
      console.warn("[jira] transition 실패:", (err as Error).message);
    }
  }

  return NextResponse.json({
    ticket: updated,
    cwd: ticket.project.path,
    initialInput,
  });
}
