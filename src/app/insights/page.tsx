"use client";

import { useMemo, useState } from "react";
import { BarChart3, Calendar as CalendarIcon, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { useActiveProjectStore } from "@/store/active-project-store";
import { CalendarTab } from "@/components/insights/calendar-tab";
import { StatsTab } from "@/components/insights/stats-tab";
import { DailyTab } from "@/components/insights/daily-tab";
import { DigestTab } from "@/components/insights/digest-tab";

type TabKey = "daily" | "calendar" | "stats" | "digest";
type RangeKey = "1d" | "7d" | "30d";

const RANGES: Record<RangeKey, { label: string; days: number }> = {
  "1d": { label: "1일", days: 1 },
  "7d": { label: "7일", days: 7 },
  "30d": { label: "30일", days: 30 },
};

export default function InsightsPage() {
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects ?? [];
  const activeId = useActiveProjectStore((s) => s.activeProjectId);
  const explicitlyUnset = useActiveProjectStore((s) => s.explicitlyUnset);

  const [tab, setTab] = useState<TabKey>("daily");
  const [range, setRange] = useState<RangeKey>("30d");
  // 프로젝트 필터: null = 전체, string = 특정 ID
  // 초기값: 활성 프로젝트(해제 상태면 null)
  const [projectFilter, setProjectFilter] = useState<string | null>(() =>
    explicitlyUnset ? null : activeId,
  );

  const { from, to } = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[range].days * 86400_000);
    return { from, to };
  }, [range]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-[var(--color-accent)]" />
          <h1 className="text-sm font-semibold">Insights</h1>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden ml-2">
          <TabButton
            active={tab === "daily"}
            onClick={() => setTab("daily")}
            icon={<FileText size={12} />}
            label="Daily"
          />
          <TabButton
            active={tab === "calendar"}
            onClick={() => setTab("calendar")}
            icon={<CalendarIcon size={12} />}
            label="Calendar"
          />
          <TabButton
            active={tab === "stats"}
            onClick={() => setTab("stats")}
            icon={<BarChart3 size={12} />}
            label="Stats"
          />
          <TabButton
            active={tab === "digest"}
            onClick={() => setTab("digest")}
            icon={<Sparkles size={12} />}
            label="Digest"
          />
        </div>

        <div className="flex-1" />

        {/* 기간 (Stats에서 주로 의미. Calendar는 월 단위로 자체 네비게이션) */}
        {tab === "stats" && (
          <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={cn(
                  "text-xs px-2.5 h-7",
                  range === k
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
                )}
              >
                {RANGES[k].label}
              </button>
            ))}
          </div>
        )}

        {/* 프로젝트 필터 — Daily 탭에선 프로젝트 구분이 파일 안에 이미 들어있어 숨김 */}
        {tab !== "daily" && (
          <select
            value={projectFilter ?? "__all__"}
            onChange={(e) =>
              setProjectFilter(
                e.target.value === "__all__" ? null : e.target.value,
              )
            }
            className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="__all__">전체 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </header>

      {/* 본문 */}
      {tab === "daily" ? (
        <DailyTab />
      ) : tab === "calendar" ? (
        <CalendarTab projectId={projectFilter} />
      ) : tab === "digest" ? (
        <DigestTab />
      ) : (
        <StatsTab from={from} to={to} projectId={projectFilter} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-xs px-2.5 h-7",
        active
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
