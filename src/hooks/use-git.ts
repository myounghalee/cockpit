import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BranchesResponse,
  CommitDetail,
  DiffResponse,
  GraphCommit,
  RepoStatus,
} from "@/types/git";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const KEYS = {
  status: (pid: string) => ["git", pid, "status"] as const,
  branches: (pid: string) => ["git", pid, "branches"] as const,
  graph: (pid: string, limit: number, all: boolean) =>
    ["git", pid, "graph", limit, all] as const,
  commit: (pid: string, hash: string) => ["git", pid, "commit", hash] as const,
  diff: (
    pid: string,
    commit: string | undefined,
    path: string,
    staged?: boolean,
  ) =>
    ["git", pid, "diff", commit ?? (staged ? "_staged" : "_wd"), path] as const,
};

export function useGitStatus(projectId: string | null) {
  return useQuery<RepoStatus>({
    queryKey: projectId ? KEYS.status(projectId) : ["git", "none"],
    queryFn: () => api(`/api/git/${projectId}/status`),
    enabled: !!projectId,
    staleTime: 10_000,
  });
}

export function useGitBranches(projectId: string | null) {
  return useQuery<BranchesResponse>({
    queryKey: projectId ? KEYS.branches(projectId) : ["git", "none"],
    queryFn: () => api(`/api/git/${projectId}/branches`),
    enabled: !!projectId,
  });
}

export function useGitGraph(
  projectId: string | null,
  limit = 500,
  allBranches = true,
) {
  return useQuery<{ commits: GraphCommit[] }>({
    queryKey: projectId
      ? KEYS.graph(projectId, limit, allBranches)
      : ["git", "none"],
    queryFn: () =>
      api(
        `/api/git/${projectId}/graph?limit=${limit}&allBranches=${allBranches}`,
      ),
    enabled: !!projectId,
  });
}

export function useGitCommit(projectId: string | null, hash: string | null) {
  return useQuery<CommitDetail>({
    queryKey:
      projectId && hash ? KEYS.commit(projectId, hash) : ["git", "none"],
    queryFn: () => api(`/api/git/${projectId}/commits/${hash}`),
    enabled: !!projectId && !!hash,
  });
}

export function useGitDiff(
  projectId: string | null,
  args:
    | {
        commit?: string;
        path: string;
        staged?: boolean;
        untracked?: boolean;
      }
    | null,
) {
  return useQuery<DiffResponse>({
    queryKey:
      projectId && args
        ? [
            ...KEYS.diff(projectId, args.commit, args.path, args.staged),
            args.untracked ?? false,
          ]
        : ["git", "none"],
    queryFn: () => {
      const qs = new URLSearchParams({ path: args!.path });
      if (args?.commit) qs.set("commit", args.commit);
      if (args?.staged) qs.set("staged", "1");
      if (args?.untracked) qs.set("untracked", "1");
      return api(`/api/git/${projectId}/diff?${qs}`);
    },
    enabled: !!projectId && !!args,
  });
}

export function useCheckout(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branch: string) =>
      api<{ ok: true; currentBranch: string }>(
        `/api/git/${projectId}/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ branch }),
        },
      ),
    onSuccess: () => {
      if (!projectId) return;
      qc.invalidateQueries({ queryKey: ["git", projectId] });
    },
  });
}

/** 모든 git 쓰기 mutation이 성공 후 호출할 공용 invalidator */
function invalidateAllGit(qc: ReturnType<typeof useQueryClient>, projectId: string | null) {
  if (!projectId) return;
  qc.invalidateQueries({ queryKey: ["git", projectId] });
}

// ─── M1 스테이징·커밋 ─────────────────────────────────────────

export function useStage(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { paths?: string[]; all?: boolean }) =>
      api(`/api/git/${projectId}/stage`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function useUnstage(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api(`/api/git/${projectId}/unstage`, {
        method: "POST",
        body: JSON.stringify({ paths }),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function useDiscard(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api(`/api/git/${projectId}/discard`, {
        method: "POST",
        body: JSON.stringify({ paths }),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function useCommit(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { message: string; amend?: boolean }) =>
      api<{ ok: true; hash: string }>(`/api/git/${projectId}/commit`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

// ─── M2 원격 ──────────────────────────────────────────────────

export function useFetchAll(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/git/${projectId}/fetch`, { method: "POST" }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function usePull(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rebase?: boolean } = {}) =>
      api(`/api/git/${projectId}/pull`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function usePush(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { force?: boolean; setUpstream?: boolean } = {}) =>
      api(`/api/git/${projectId}/push`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

// ─── M3 merge/rebase/abort ────────────────────────────────────

export function useMerge(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      branch: string;
      noFF?: boolean;
      ffOnly?: boolean;
      squash?: boolean;
    }) =>
      api(`/api/git/${projectId}/merge`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function useRebase(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (onto: string) =>
      api(`/api/git/${projectId}/rebase`, {
        method: "POST",
        body: JSON.stringify({ onto }),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function useAbort(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: "merge" | "rebase") =>
      api(`/api/git/${projectId}/abort`, {
        method: "POST",
        body: JSON.stringify({ op }),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

// ─── M4 stash ─────────────────────────────────────────────────

export interface StashEntry {
  index: number;
  ref: string;
  subject: string;
  ago: string;
}

export function useStashList(projectId: string | null) {
  return useQuery<{ stashes: StashEntry[] }>({
    queryKey: projectId ? ["git", projectId, "stash"] : ["git", "none"],
    queryFn: () => api(`/api/git/${projectId}/stash`),
    enabled: !!projectId,
  });
}

export function useStashMutation(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      action: "save" | "pop" | "drop" | "apply";
      message?: string;
      index?: number;
    }) =>
      api(`/api/git/${projectId}/stash`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

// ─── M5 브랜치 CRUD ────────────────────────────────────────────

export function useCreateBranch(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; from?: string }) =>
      api(`/api/git/${projectId}/branches`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

export function useDeleteBranch(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; force?: boolean; remote?: boolean }) => {
      const qs = new URLSearchParams();
      if (body.force) qs.set("force", "1");
      if (body.remote) qs.set("remote", "1");
      return api(
        `/api/git/${projectId}/branches/${encodeURIComponent(body.name)}?${qs}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}

// ─── M6 Quick Actions ──────────────────────────────────────────

export interface QuickAction {
  id: string;
  projectId: string | null;
  name: string;
  icon?: string | null;
  steps: string; // JSON string
  order: number;
  createdAt: string;
}

export function useQuickActions(projectId: string | null) {
  return useQuery<{ actions: QuickAction[] }>({
    queryKey: projectId
      ? ["git", projectId, "quick-actions"]
      : ["git", "none"],
    queryFn: () => api(`/api/git/${projectId}/quick-actions`),
    enabled: !!projectId,
  });
}

export function useCreateQuickAction(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      steps: unknown[];
      icon?: string;
      global?: boolean;
    }) =>
      api<QuickAction>(`/api/git/${projectId}/quick-actions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: projectId ? ["git", projectId, "quick-actions"] : ["none"],
      }),
  });
}

export function useUpdateQuickAction(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      icon?: string;
      steps?: unknown[];
      order?: number;
    }) =>
      api<QuickAction>(`/api/git/${projectId}/quick-actions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: projectId ? ["git", projectId, "quick-actions"] : ["none"],
      }),
  });
}

export function useDeleteQuickAction(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/git/${projectId}/quick-actions/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: projectId ? ["git", projectId, "quick-actions"] : ["none"],
      }),
  });
}

export function useRunQuickAction(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{
        ok: boolean;
        results: Array<{ step: unknown; ok: boolean; error?: string }>;
        failedAt?: number;
      }>(`/api/git/${projectId}/quick-actions/${id}/run`, {
        method: "POST",
      }),
    onSuccess: () => invalidateAllGit(qc, projectId),
  });
}
