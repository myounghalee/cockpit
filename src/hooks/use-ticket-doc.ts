import { useQuery } from "@tanstack/react-query";

export type DocType = "plan" | "design" | "analysis" | "report";

export interface TicketDoc {
  type: DocType;
  path: string | null;
  content: string | null;
  updatedAt?: string;
}

export function useTicketDoc(ticketId: string | null, type: DocType | null) {
  return useQuery<TicketDoc>({
    queryKey: ["ticket-doc", ticketId, type],
    enabled: !!ticketId && !!type,
    queryFn: async () => {
      const res = await fetch(
        `/api/tickets/${ticketId}/doc?type=${type}`,
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
