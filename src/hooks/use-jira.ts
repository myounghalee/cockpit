import { useQuery } from "@tanstack/react-query";

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  type: string;
  description: string;
}

export function useMyJiraIssues() {
  return useQuery<{ issues: JiraIssue[] }>({
    queryKey: ["jira", "my-issues"],
    queryFn: async () => {
      const res = await fetch("/api/jira/my-issues");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
      return res.json();
    },
    staleTime: 60_000, // 1분
    retry: 1,
  });
}
