import { useQuery } from "@tanstack/react-query";

export interface ChecklistItem {
  checked: boolean;
  text: string;
  line: number;
}

export interface ChecklistResponse {
  exists: boolean;
  path: string;
  items: ChecklistItem[];
}

export function useTicketChecklist(ticketId: string | null) {
  return useQuery<ChecklistResponse>({
    queryKey: ["ticket-checklist", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/checklist`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 6_000,
    staleTime: 3_000,
  });
}
