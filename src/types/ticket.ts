export type TicketStatus = "backlog" | "in_progress" | "review" | "done";
export type TicketType = "feature" | "bug" | "improvement" | "check";
export type PdcaStage = "plan" | "design" | "do" | "check" | "report";
export type AutoMode = "manual" | "after_plan" | "full";
export type CommitMode = "none" | "commit" | "commit_push" | "commit_push_pr";

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  type: TicketType | string;
  successCriteria: string | null;
  jiraKey: string | null;
  sessionId: string | null;
  status: TicketStatus | string;
  priority: number;
  order: number;
  startedAt: string | null;
  completedAt: string | null;
  reworkCount: number;
  lastReworkRequest: string | null;
  resultSummary: string | null;
  pdcaStage: PdcaStage | string | null;
  autoMode: AutoMode | string;
  commitMode: CommitMode | string;
  projectName?: string; // Feature 3: 전체 보기 시 포함
  createdAt: string;
  updatedAt: string;
}

export interface StartTicketResponse {
  ticket: Ticket;
  cwd: string;
  initialInput: string;
}
