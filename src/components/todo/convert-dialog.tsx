"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { useConvertMemoToTicket } from "@/hooks/use-memos";
import { useActiveProjectStore } from "@/store/active-project-store";
import type { Memo } from "@/types/memo";

interface ConvertDialogProps {
  memo: Memo | null;
  onOpenChange: (open: boolean) => void;
}

export function ConvertDialog({ memo, onOpenChange }: ConvertDialogProps) {
  const router = useRouter();
  const { data } = useProjects();
  const projects = data?.projects ?? [];
  const activeId = useActiveProjectStore((s) => s.activeProjectId);

  const [projectId, setProjectId] = useState<string>("");
  const [autoMode, setAutoMode] = useState<string>("manual");
  const [commitMode, setCommitMode] = useState<string>("none");

  const convert = useConvertMemoToTicket();

  useEffect(() => {
    if (!memo) return;
    // 기본: 메모의 프로젝트 > 활성 프로젝트 > 빈 값
    setProjectId(memo.projectId ?? activeId ?? "");
    setAutoMode("manual");
    setCommitMode("none");
  }, [memo, activeId]);

  if (!memo) return null;

  const needsProjectChoice = !memo.projectId;
  const canConvert = projectId !== "";

  const handleConvert = () => {
    if (!canConvert) return;
    convert.mutate(
      {
        id: memo.id,
        projectId: needsProjectChoice ? projectId : undefined,
        autoMode,
        commitMode,
      },
      {
        onSuccess: (res) => {
          onOpenChange(false);
          // 칸반으로 이동 + 새 티켓 자동 선택
          router.push(`/kanban?ticket=${res.ticket.id}`);
        },
      },
    );
  };

  return (
    <Dialog open={!!memo} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>칸반 티켓으로 변환</DialogTitle>
        <DialogDescription>
          &ldquo;{memo.title}&rdquo; 메모가 Backlog에 새 티켓으로 추가됩니다.
          변환 후 메모는 아카이브되지 않고 티켓 링크만 남습니다.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          {needsProjectChoice && (
            <div>
              <label className="text-xs text-[var(--color-foreground-muted)] mb-1 block">
                프로젝트 선택 (필수)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="">선택하세요</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--color-foreground-muted)] mb-1 block">
              PDCA 실행 모드
            </label>
            <select
              value={autoMode}
              onChange={(e) => setAutoMode(e.target.value)}
              className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            >
              <option value="manual">수동 (각 단계 승인)</option>
              <option value="after_plan">Plan 이후 자동 진행</option>
              <option value="full">완전 자동</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-[var(--color-foreground-muted)] mb-1 block">
              Act 완료 시 커밋 동작
            </label>
            <select
              value={commitMode}
              onChange={(e) => setCommitMode(e.target.value)}
              className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            >
              <option value="none">없음 (수동 커밋)</option>
              <option value="commit">커밋만</option>
              <option value="commit_push">커밋 + Push</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleConvert}
            disabled={!canConvert || convert.isPending}
          >
            {convert.isPending ? "변환 중..." : "변환 + 칸반으로 이동"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
