import { useQuery } from "@tanstack/react-query";
import type { InsightsStats } from "@/types/insights";

export interface InsightsStatsParams {
  from: Date;
  to: Date;
  projectId: string | null;
}

const STATS_KEY = (p: InsightsStatsParams) =>
  [
    "insights-stats",
    p.from.toISOString(),
    p.to.toISOString(),
    p.projectId ?? "__all__",
  ] as const;

async function fetchStats(p: InsightsStatsParams): Promise<InsightsStats> {
  const params = new URLSearchParams({
    from: p.from.toISOString(),
    to: p.to.toISOString(),
  });
  if (p.projectId) params.set("projectId", p.projectId);
  const res = await fetch(`/api/insights/stats?${params}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useInsightsStats(p: InsightsStatsParams) {
  return useQuery({
    queryKey: STATS_KEY(p),
    queryFn: () => fetchStats(p),
    staleTime: 30_000,
  });
}
