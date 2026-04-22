"use client";

import { useAbort, useGitStatus } from "@/hooks/use-git";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: string;
}

/**
 * status 응답에 `U` 표시 파일이 있으면 머지·리베이스 충돌 진행 중.
 * 어느 op인지는 서버가 직접 알지 못하므로 두 버튼(Abort merge / Abort rebase) 제공.
 */
export function ConflictBanner({ projectId }: Props) {
  const { data } = useGitStatus(projectId);
  const abort = useAbort(projectId);

  const hasConflict =
    !!data &&
    [...(data.staged ?? []), ...(data.unstaged ?? [])].some((f) =>
      /U/.test(f.status),
    );
  if (!hasConflict) return null;

  const conflictFiles = [...data!.staged, ...data!.unstaged]
    .filter((f) => /U/.test(f.status))
    .map((f) => f.path);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[var(--color-danger)]/10 border-b border-[var(--color-danger)]/30 text-xs">
      <AlertTriangle size={14} className="text-[var(--color-danger)]" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-[var(--color-danger)]">
          충돌 {conflictFiles.length}개
        </span>{" "}
        <span className="text-[var(--color-foreground-muted)]">
          해결 후 스테이징→커밋하거나 abort하세요:
        </span>{" "}
        <span
          className="truncate font-mono text-[10px]"
          title={conflictFiles.join(", ")}
        >
          {conflictFiles.slice(0, 3).join(", ")}
          {conflictFiles.length > 3 && "…"}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (confirm("머지를 중단할까요?")) abort.mutate("merge");
        }}
      >
        Abort merge
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (confirm("리베이스를 중단할까요?")) abort.mutate("rebase");
        }}
      >
        Abort rebase
      </Button>
    </div>
  );
}
