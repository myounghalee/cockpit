import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type {
  Project,
  ProjectFolder,
  ProjectsResponse,
  TreeResponse,
} from "@/types/project";

const PROJECTS_KEY = ["projects"] as const;

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

export function useProjects() {
  return useQuery<ProjectsResponse>({
    queryKey: PROJECTS_KEY,
    queryFn: () => api<ProjectsResponse>("/api/projects"),
  });
}

export function useProject(id: string | null) {
  return useQuery<Project & { isGitRepo: boolean }>({
    queryKey: ["projects", id],
    queryFn: () => api(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useProjectTree(
  id: string | null,
  subPath: string | undefined,
  depth = 1,
) {
  return useQuery<TreeResponse>({
    queryKey: ["projects", id, "tree", subPath ?? "/", depth],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (subPath) qs.set("path", subPath);
      if (depth !== 1) qs.set("depth", String(depth));
      const suffix = qs.toString() ? `?${qs}` : "";
      return api<TreeResponse>(`/api/projects/${id}/tree${suffix}`);
    },
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      path: string;
      folderId?: string | null;
    }) =>
      api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      folderId?: string | null;
      isFavorite?: boolean;
      order?: number;
    }) =>
      api<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/projects/${id}`, {
        method: "DELETE",
        parseEmpty: true,
      }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      // 관련 stale 캐시 제거 — 삭제된 프로젝트에 대한 API 호출이 남지 않도록
      qc.removeQueries({ queryKey: ["projects", id] });
      qc.removeQueries({ queryKey: ["tickets", id] });
      qc.removeQueries({ queryKey: ["git", id] });
    },
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<ProjectFolder>("/api/folders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      collapsed?: boolean;
      order?: number;
    }) =>
      api<ProjectFolder>(`/api/folders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/folders/${id}`, {
        method: "DELETE",
        parseEmpty: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}
