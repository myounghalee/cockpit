export interface InsightsStats {
  /** 요약 카드용 합계 */
  totals: {
    ticketsCreated: number;
    ticketsStarted: number;
    ticketsCompleted: number;
    memosCreated: number;
    /** 완료된 티켓 평균 처리 시간 (시간 단위). 완료 티켓 없으면 null */
    averageCompletionHours: number | null;
  };
  /** 티켓 type별 집계 (feature/bug/improvement/check) — 기간 내 생성 기준 */
  byType: Array<{ label: string; value: number; color?: string }>;
  /** 티켓 status별 집계 (backlog/in_progress/review/done) — 현재 스냅샷, 기간 외 포함 */
  byStatus: Array<{ label: string; value: number; color?: string }>;
  /** 프로젝트별 생성 티켓 수 (Top N) */
  byProject: Array<{
    projectId: string;
    name: string;
    count: number;
  }>;
  /** 일별 활동량 (생성 티켓 + 생성 메모). 스파크라인 용도. 길이 = 기간 일수 */
  dailyCounts: Array<{
    date: string; // YYYY-MM-DD
    tickets: number;
    memos: number;
  }>;
}
