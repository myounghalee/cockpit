"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GitBranch, ChevronDown, Plus, GitMerge, GitPullRequestArrow } from "lucide-react";
import {
  useCheckout,
  useDeleteBranch,
  useGitBranches,
  useGitStatus,
  useMerge,
  useRebase,
} from "@/hooks/use-git";
import { cn } from "@/lib/utils";
import { CreateBranchDialog } from "./create-branch-dialog";

interface Props {
  projectId: string;
}

export function BranchPicker({ projectId }: Props) {
  const { data: branches } = useGitBranches(projectId);
  const { data: status } = useGitStatus(projectId);
  const checkout = useCheckout(projectId);
  const merge = useMerge(projectId);
  const rebase = useRebase(projectId);
  const del = useDeleteBranch(projectId);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const current = status?.currentBranch ?? branches?.current ?? "…";

  const wrap = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center gap-2 h-8 px-3 rounded-md text-sm",
                "border border-[var(--color-border)] bg-[var(--color-surface)]",
                "hover:bg-[var(--color-surface-hover)]",
              )}
            >
              <GitBranch
                size={13}
                className="text-[var(--color-foreground-muted)]"
              />
              <span className="font-mono">{current}</span>
              <ChevronDown size={12} className="opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-72 max-h-[440px] overflow-y-auto"
          >
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus size={12} /> 새 브랜치…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {branches?.local.length ? (
              <>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-foreground-dim)]">
                  Local
                </div>
                {branches.local.map((b) => (
                  <BranchItem
                    key={b.name}
                    branch={b}
                    isCurrent={b.current ?? false}
                    onCheckout={() => wrap(() => checkout.mutateAsync(b.name))}
                    onMerge={() =>
                      wrap(() => merge.mutateAsync({ branch: b.name }))
                    }
                    onRebase={() =>
                      wrap(() => rebase.mutateAsync(b.name))
                    }
                    onDelete={() =>
                      wrap(() =>
                        del.mutateAsync({ name: b.name, force: false }),
                      )
                    }
                    onDeleteRemote={() =>
                      wrap(() =>
                        del.mutateAsync({ name: b.name, remote: true }),
                      )
                    }
                    isRemote={false}
                  />
                ))}
              </>
            ) : null}
            {branches?.remote.length ? (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-foreground-dim)]">
                  Remote
                </div>
                {branches.remote.map((b) => (
                  <BranchItem
                    key={b.name}
                    branch={b}
                    isCurrent={false}
                    isRemote
                    onCheckout={() =>
                      wrap(() => checkout.mutateAsync(b.name))
                    }
                    onMerge={() =>
                      wrap(() => merge.mutateAsync({ branch: b.name }))
                    }
                    onRebase={() =>
                      wrap(() => rebase.mutateAsync(b.name))
                    }
                    onDeleteRemote={() =>
                      wrap(() =>
                        del.mutateAsync({
                          name: b.name.replace(/^origin\//, ""),
                          remote: true,
                        }),
                      )
                    }
                  />
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {(status?.ahead ?? 0) > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            title={`원격보다 ${status?.ahead}개 앞섬`}
          >
            ↑{status?.ahead}
          </span>
        )}
        {(status?.behind ?? 0) > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
            title={`원격보다 ${status?.behind}개 뒤처짐`}
          >
            ↓{status?.behind}
          </span>
        )}
        {error && (
          <span
            className="text-[10px] text-[var(--color-danger)] truncate max-w-[200px]"
            title={error}
          >
            {error}
          </span>
        )}
      </div>
      <CreateBranchDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}

function BranchItem({
  branch,
  isCurrent,
  isRemote,
  onCheckout,
  onMerge,
  onRebase,
  onDelete,
  onDeleteRemote,
}: {
  branch: { name: string; upstream?: string };
  isCurrent: boolean;
  isRemote: boolean;
  onCheckout: () => void;
  onMerge: () => void;
  onRebase: () => void;
  onDelete?: () => void;
  onDeleteRemote?: () => void;
}) {
  // 현재 브랜치면 sub menu 없이 플래그만 표시
  if (isCurrent) {
    return (
      <DropdownMenuItem disabled>
        <GitBranch size={11} />
        <span className="truncate flex-1">{branch.name}</span>
        <span className="text-[10px] text-[var(--color-accent)]">current</span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <GitBranch
          size={11}
          className={isRemote ? "text-[var(--color-foreground-dim)]" : ""}
        />
        <span className="truncate flex-1">{branch.name}</span>
        {branch.upstream && (
          <span className="text-[10px] text-[var(--color-foreground-dim)]">
            ↑{branch.upstream.replace("origin/", "")}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-[180px]">
        <DropdownMenuItem onSelect={onCheckout}>
          체크아웃
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMerge}>
          <GitMerge size={11} /> 이 브랜치로 머지
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRebase}>
          <GitPullRequestArrow size={11} /> 이 브랜치 위로 리베이스
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {onDelete && (
          <DropdownMenuItem
            onSelect={() => {
              if (confirm(`로컬 브랜치 "${branch.name}" 삭제할까요?`))
                onDelete();
            }}
            className="text-[var(--color-danger)]"
          >
            로컬 삭제
          </DropdownMenuItem>
        )}
        {onDeleteRemote && (
          <DropdownMenuItem
            onSelect={() => {
              if (
                confirm(
                  `원격 브랜치 "${branch.name}" 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
                )
              )
                onDeleteRemote();
            }}
            className="text-[var(--color-danger)]"
          >
            원격 삭제
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
