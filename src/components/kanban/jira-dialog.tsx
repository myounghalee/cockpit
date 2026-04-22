"use client";

import { useMyJiraIssues } from "@/hooks/use-jira";
import { Import, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (issue: {
    key: string;
    summary: string;
    description: string;
  }) => void;
}

export function JiraDialog({ open, onOpenChange, onImport }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useMyJiraIssues();
  const issues = data?.issues ?? [];

  const handleImport = (issue: {
    key: string;
    summary: string;
    description: string;
  }) => {
    onImport(issue);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <div className="flex items-center justify-between h-10 pl-4 pr-12 border-b border-[var(--color-border)]">
          <DialogTitle>내 미해결 이슈</DialogTitle>
          <button
            onClick={() => refetch()}
            className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
            title="새로고침"
          >
            <RefreshCw
              size={13}
              className={isFetching ? "animate-spin" : ""}
            />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 flex flex-col gap-1.5">
          {isLoading && (
            <div className="text-xs text-[var(--color-foreground-dim)] p-3 text-center">
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
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
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
                <div className="text-xs text-[var(--color-foreground)]">
                  {issue.summary}
                </div>
                <button
                  onClick={() => handleImport(issue)}
                  className="mt-2 flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:underline"
                >
                  <Import size={10} /> 임포트
                </button>
              </div>
            ))}
          {!isLoading && !error && issues.length === 0 && (
            <div className="text-xs text-[var(--color-foreground-dim)] p-3 text-center">
              미해결 이슈 없음
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-2 border-t border-[var(--color-border)]">
          <DialogClose className="text-xs text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] px-3 py-1 rounded hover:bg-[var(--color-surface-hover)]">
            닫기
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
