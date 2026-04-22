/**
 * 티켓 정보를 Claude CLI에 넘길 프롬프트와 명령어로 변환.
 */
import { buildPdcaPrompt, type PdcaStage } from "./pdca-prompts";

export interface TicketLike {
  id?: string;
  title: string;
  description?: string | null;
  successCriteria?: string | null;
  type?: string | null;
  jiraKey?: string | null;
  lastReworkRequest?: string | null;
  pdcaStage?: string | null;
}

function isPdcaStage(value: unknown): value is PdcaStage {
  return (
    value === "plan" ||
    value === "design" ||
    value === "do" ||
    value === "check" ||
    value === "report"
  );
}

export function buildClaudePrompt(ticket: TicketLike): string {
  // PDCA 티켓이면 현재 단계 전용 프롬프트 반환
  if (isPdcaStage(ticket.pdcaStage) && ticket.id) {
    return buildPdcaPrompt(
      {
        ticketId: ticket.id,
        title: ticket.title,
        description: ticket.description,
        successCriteria: ticket.successCriteria,
        jiraKey: ticket.jiraKey,
        lastReworkRequest: ticket.lastReworkRequest,
      },
      ticket.pdcaStage,
    );
  }

  const parts: string[] = [];
  parts.push(`# ${ticket.title}`);
  if (ticket.jiraKey) parts.push(`(Jira: ${ticket.jiraKey})`);

  if (ticket.description?.trim()) {
    parts.push(`\n## 설명\n${ticket.description.trim()}`);
  }
  if (ticket.successCriteria?.trim()) {
    parts.push(`\n## 성공 기준\n${ticket.successCriteria.trim()}`);
  }
  if (ticket.lastReworkRequest?.trim()) {
    parts.push(`\n## 재작업 요청\n${ticket.lastReworkRequest.trim()}`);
  }
  return parts.join("\n");
}

/**
 * shell에 안전하게 넘기기 위한 이스케이프 + `claude [--resume ID] "<prompt>"` 생성.
 * 마지막에 엔터(\r)로 끝내 pty에 바로 실행되도록 함.
 * Windows(cmd.exe/PowerShell)와 Unix(bash/zsh) 이스케이프를 분기 처리.
 */
export function buildClaudeCommand(prompt: string, sessionId?: string | null): string {
  const resume = sessionId ? ` --resume ${sessionId}` : "";
  // 칸반에서 실행되는 Claude는 승인 프롬프트 없이 끝까지 진행되도록 permission을 건너뜀.
  // cockpit 자체가 샌드박스된 개발 환경을 전제로 하며, 사용자가 UI에서 승인/중지를 제어함.
  const flags = " --dangerously-skip-permissions";

  if (process.platform === "win32") {
    // PowerShell: 쌍따옴표 안의 특수문자를 backtick(`)으로 이스케이프
    const escaped = prompt
      .replace(/`/g, "``")
      .replace(/"/g, '`"')
      .replace(/\$/g, "`$");
    return `claude${resume}${flags} "${escaped}"\r`;
  }

  // Unix (bash/zsh)
  const escaped = prompt
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  return `claude${resume}${flags} "${escaped}"\r`;
}
