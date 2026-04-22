import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Memo } from "@/types/memo";

// projectFilter
//   null         → 전체 (프로젝트별 + 전역 둘 다)
//   "__global__" → 전역 메모만 (projectId=null)
//   string       → 해당 프로젝트만
export type MemoProjectFilter = string | null;

const MEMOS_KEY = (filter: MemoProjectFilter, archived: boolean) =>
  ["memos", filter ?? "__all__", archived] as const;

async function api<T>(
  url: string,
  init?: RequestInit & { parseEmpty?: boolean },
): Promise<T> {
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

export function useMemos(
  filter: MemoProjectFilter,
  opts: { archived?: boolean } = {},
) {
  return useQuery<{ memos: Memo[] }>({
    queryKey: MEMOS_KEY(filter, opts.archived ?? false),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === "__global__") params.set("projectId", "null");
      else if (filter) params.set("projectId", filter);
      if (opts.archived) params.set("archived", "1");
      const qs = params.toString();
      return api(`/api/memos${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useCreateMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      projectId?: string | null;
      title: string;
      content?: string;
      tags?: string;
    }) =>
      api<Memo>("/api/memos", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memos"] }),
  });
}

export function useUpdateMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      content?: string;
      tags?: string;
      projectId?: string | null;
      pinned?: boolean;
      archived?: boolean;
      completed?: boolean;
    }) =>
      api<Memo>(`/api/memos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    // Optimistic update — content 편집 즉시 반영
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["memos"] });
      const snapshots: Array<{ key: unknown; data: unknown }> = [];
      qc.getQueriesData<{ memos: Memo[] }>({ queryKey: ["memos"] }).forEach(
        ([key, data]) => {
          if (!data) return;
          snapshots.push({ key, data });
          qc.setQueryData(key, {
            memos: data.memos.map((m) =>
              m.id === id
                ? ({
                    ...m,
                    ...(patch.title !== undefined && { title: patch.title }),
                    ...(patch.content !== undefined && { content: patch.content }),
                    ...(patch.tags !== undefined && { tags: patch.tags }),
                    ...(patch.projectId !== undefined && { projectId: patch.projectId }),
                    ...(patch.pinned !== undefined && {
                      pinnedAt: patch.pinned ? new Date().toISOString() : null,
                    }),
                    ...(patch.archived !== undefined && {
                      archivedAt: patch.archived ? new Date().toISOString() : null,
                    }),
                    ...(patch.completed !== undefined && {
                      completedAt: patch.completed ? new Date().toISOString() : null,
                    }),
                  } as Memo)
                : m,
            ),
          });
        },
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(({ key, data }) => {
        // @ts-expect-error — react-query가 key 타입을 unknown으로 내줌
        qc.setQueryData(key, data);
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["memos"] }),
  });
}

export function useDeleteMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/memos/${id}`, {
        method: "DELETE",
        parseEmpty: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memos"] }),
  });
}

export function useConvertMemoToTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      projectId?: string;
      autoMode?: string;
      commitMode?: string;
    }) =>
      api<{ ticket: { id: string }; memoId: string }>(
        `/api/memos/${id}/convert-to-ticket`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memos"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
