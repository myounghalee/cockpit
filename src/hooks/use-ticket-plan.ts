import { useQuery } from "@tanstack/react-query";

export interface TicketPlan {
  path: string | null;
  content: string | null;
  updatedAt?: string;
}

export function useTicketPlan(ticketId: string | null) {
  return useQuery<TicketPlan>({
    queryKey: ["ticket-plan", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/plan`);
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    refetchInterval: 10_000, // 10초마다 갱신 (plan 생성 감지)
    staleTime: 5_000,
  });
}
