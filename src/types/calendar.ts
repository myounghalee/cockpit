export type CalendarEventType =
  | "ticket_created"
  | "ticket_started"
  | "ticket_completed"
  | "memo_created";

export interface CalendarEvent {
  /** 이벤트 고유 id (source + sourceId + type 조합) */
  id: string;
  type: CalendarEventType;
  /** ISO datetime string */
  timestamp: string;
  /** 이벤트 타이틀 — 티켓 제목 또는 메모 제목 */
  title: string;
  /** 프로젝트 ID — 전역 메모는 null */
  projectId: string | null;
  projectName: string | null;
  /** 클릭 시 이동할 ID (라우팅용) */
  ticketId?: string;
  memoId?: string;
  /** 티켓의 PDCA 단계 (해당되는 경우) */
  pdcaStage?: string | null;
}
