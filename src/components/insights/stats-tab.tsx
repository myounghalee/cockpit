"use client";

import {
  FileText,
  Play,
  CheckCircle2,
  StickyNote,
  TrendingUp,
  FolderKanban,
} from "lucide-react";
import { useInsightsStats } from "@/hooks/use-insights-stats";
import { PieChart, BarChart, Sparkline } from "./charts";
import type { BarDatum } from "./charts";

interface Props {
  from: Date;
  to: Date;
  projectId: string | null;
}

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 24) return `${h.toFixed(1)}시간`;
  return `${(h / 24).toFixed(1)}일`;
}

export function StatsTab({ from, to, projectId }: Props) {
  const { data, isLoading } = useInsightsStats({ from, to, projectId });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-foreground-dim)]">
        불러오는 중…
      </div>
    );
  }

  if (!data) return null;

  const { totals, byType, byStatus, byProject, dailyCounts } = data;

  const projectBars: BarDatum[] = byProject.slice(0, 8).map((p) => ({
    label: p.name,
    value: p.count,
  }));

  const sparkValues = dailyCounts.map((d) => d.tickets + d.memos);
  const sparkLabels = dailyCounts.map((d) => {
    const [, m, day] = d.date.split("-");
    return `${Number(m)}/${Number(day)}`;
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* 요약 카드 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={<FileText size={14} className="text-blue-400" />}
            label="생성된 티켓"
            value={totals.ticketsCreated}
          />
          <SummaryCard
            icon={<Play size={14} className="text-purple-400" />}
            label="실행된 티켓"
            value={totals.ticketsStarted}
          />
          <SummaryCard
            icon={<CheckCircle2 size={14} className="text-emerald-400" />}
            label="완료된 티켓"
            value={totals.ticketsCompleted}
            sub={
              totals.averageCompletionHours !== null
                ? `평균 ${formatHours(totals.averageCompletionHours)}`
                : undefined
            }
          />
          <SummaryCard
            icon={<StickyNote size={14} className="text-amber-400" />}
            label="작성된 메모"
            value={totals.memosCreated}
          />
        </div>

        {/* 일별 추이 */}
        <Card
          title="일별 활동"
          sub={`티켓 + 메모 생성량 (${dailyCounts.length}일)`}
          icon={<TrendingUp size={14} />}
        >
          <Sparkline values={sparkValues} labels={sparkLabels} height={80} />
        </Card>

        {/* 분포 — 2단 */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card
            title="작업 종류"
            sub="기간 내 생성된 티켓의 유형 분포"
            icon={<FileText size={14} />}
          >
            <PieChart data={byType} />
          </Card>
          <Card
            title="현재 상태"
            sub="기간에 활동이 있었던 티켓들의 현재 상태"
            icon={<CheckCircle2 size={14} />}
          >
            <PieChart data={byStatus} />
          </Card>
        </div>

        {/* 프로젝트별 */}
        <Card
          title="프로젝트별 생성"
          sub="이번 기간에 가장 많이 작업한 프로젝트"
          icon={<FolderKanban size={14} />}
        >
          <BarChart data={projectBars} />
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  sub,
  icon,
  children,
}: {
  title: string;
  sub?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-5">
      <header className="flex items-start gap-2 mb-4">
        {icon && (
          <div className="w-7 h-7 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {sub && (
            <p className="text-[11px] text-[var(--color-foreground-dim)]">
              {sub}
            </p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-foreground-dim)] uppercase tracking-wider mb-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && (
        <div className="text-[11px] text-[var(--color-foreground-dim)] mt-1">
          {sub}
        </div>
      )}
    </div>
  );
}
