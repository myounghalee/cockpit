"use client";

import { useState } from "react";
import { useMyJiraIssues } from "@/hooks/use-jira";
import { ChevronRight, ChevronLeft, Import, RefreshCw } from "lucide-react";

interface Props {
  onImport: (issue: {
    key: string;
    summary: string;
    description: string;
  }) => void;
}

export function JiraPanel({ onImport }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useMyJiraIssues();
  const issues = data?.issues ?? [];

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-8 flex flex-col items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-surface)]/40 hover:bg-[var(--color-surface-hover)] shrink-0"
        title="Jira 패널 열기"
      >
        <ChevronLeft size={14} className="text-[var(--color-foreground-dim)]" />
        <span className="text-[10px] text-[var(--color-foreground-dim)] mt-2 [writing-mode:vertical-lr]">
          Jira ({issues.length})
        </span>
      </button>
    );
  }

  return (
    <div className="w-72 shrink-0 border-l border-[var(--color-border)] flex flex-col bg-[var(--color-surface)]/40">
      <div className="flex items-center justify-between h-9 px-3 border-b border-[var(--color-border)]">
        <span className="text-xs font-semibold text-[var(--color-foreground-muted)]">
          내 미해결 이슈
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
            title="새로고침"
          >
            <RefreshCw
              size={12}
              className={isFetching ? "animate-spin" : ""}
            />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
            title="접기"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {isLoading && (
          <div className="text-xs text-[var(--color-foreground-dim)] p-2 text-center">
            불러오는 중…
          </div>
        )}
        {error && (
          <div className="text-xs text-[var(--color-danger)] p-2">
            {(error as Error).message}
          </div>
        )}
        {!isLoading &&
          !error &&
          issues.map((issue) => (
            <div
              key={issue.key}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
            >
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="font-mono text-[10px] text-[var(--color-foreground-muted)]">
                  {issue.key}
                </span>
                <span className="text-[10px] px-1 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]">
                  {issue.type}
                </span>
                <span className="text-[10px] text-[var(--color-foreground-dim)]">
                  {issue.status}
                </span>
              </div>
              <div className="text-xs text-[var(--color-foreground)] truncate">
                {issue.summary}
              </div>
              <button
                onClick={() => onImport(issue)}
                className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:underline"
              >
                <Import size={10} /> 임포트
              </button>
            </div>
          ))}
        {!isLoading && !error && issues.length === 0 && (
          <div className="text-xs text-[var(--color-foreground-dim)] p-2 text-center">
            미해결 이슈 없음
          </div>
        )}
      </div>
    </div>
  );
}
