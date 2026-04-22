import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { StartTicketResponse, Ticket } from "@/types/ticket";

const TICKETS_KEY = (projectId: string | null) =>
  ["tickets", projectId] as const;

async function api<T>(url: string, init?: RequestInit & { parseEmpty?: boolean }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (init?.parseEmpty || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function useTickets(projectId: string | null) {
  const qc = useQueryClient();

  // 터미널 탭 닫힐 때 티켓 상태 변경 이벤트 수신 → 자동 갱신
  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
    };
    window.addEventListener("ticket-updated", handler);
    return () => window.removeEventListener("ticket-updated", handler);
  }, [qc]);

  return useQuery<{ tickets: Ticket[] }>({
    queryKey: TICKETS_KEY(projectId),
    queryFn: () => {
      const url = projectId
        ? `/api/tickets?projectId=${projectId}`
        : `/api/tickets`;
      return api(url);
    },
  });
}

export function useCreateTicket(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      successCriteria?: string;
      jiraKey?: string;
      status?: string;
    }) =>
      api<Ticket>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ projectId, ...body }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY(projectId) }),
  });
}

export function useUpdateTicket(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: Partial<Ticket> & { id: string }) =>
      api<Ticket>(`/api/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    // Optimistic update
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: TICKETS_KEY(projectId) });
      const prev = qc.getQueryData<{ tickets: Ticket[] }>(TICKETS_KEY(projectId));
      if (prev) {
        qc.setQueryData<{ tickets: Ticket[] }>(TICKETS_KEY(projectId), {
          tickets: prev.tickets.map((t) =>
            t.id === id ? { ...t, ...patch } as Ticket : t,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(TICKETS_KEY(projectId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TICKETS_KEY(projectId) }),
  });
}

export function useDeleteTicket(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/tickets/${id}`, {
        method: "DELETE",
        parseEmpty: true,
      }),
    // Optimistic: 서버 응답 전에 즉시 카드 제거 → 삭제 버튼 반응 지연 없음
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tickets"] });
      // "tickets" 하위 모든 queryKey를 뒤져서 해당 id 제거
      // (프로젝트별 뷰 + 전체 뷰 양쪽에서 동시에 사라지게)
      const snapshots: Array<{ key: readonly unknown[]; data: { tickets: Ticket[] } }> = [];
      qc.getQueriesData<{ tickets: Ticket[] }>({ queryKey: ["tickets"] }).forEach(
        ([key, data]) => {
          if (!data) return;
          snapshots.push({ key, data });
          qc.setQueryData<{ tickets: Ticket[] }>(key, {
            tickets: data.tickets.filter((t) => t.id !== id),
          });
        },
      );
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      // 실패 시 각 key의 스냅샷을 다시 밀어넣어 롤백
      ctx?.snapshots.forEach(({ key, data }) => {
        qc.setQueryData(key, data);
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  });
}

export function useStartTicket(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<StartTicketResponse>(`/api/tickets/${id}/start`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY(projectId) }),
  });
}

export function useReworkTicket(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<Ticket>(`/api/tickets/${id}/rework`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TICKETS_KEY(projectId) }),
  });
}
