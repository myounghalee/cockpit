import { useQuery } from "@tanstack/react-query";

export interface StageInfo {
  stage: "plan" | "design" | "do" | "check" | "report";
  file: string;
  exists: boolean;
  path: string | null;
  updatedAt: string | null;
  size?: number;
}

export interface TicketStagesResponse {
  ticketId: string;
  currentStage: string | null;
  dir: string;
  stages: StageInfo[];
}

export function useTicketStages(ticketId: string | null) {
  return useQuery<TicketStagesResponse>({
    queryKey: ["ticket-stages", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/stages`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 8_000,
    staleTime: 4_000,
  });
}
