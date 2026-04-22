"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  QuickAction,
  useDeleteQuickAction,
  useQuickActions,
  useRunQuickAction,
} from "@/hooks/use-git";
import { Zap, Plus, Pencil, Trash2, Play, ChevronDown } from "lucide-react";
import { QuickActionDialog } from "./quick-action-dialog";

interface Props {
  projectId: string;
}

export function QuickActionsMenu({ projectId }: Props) {
  const { data } = useQuickActions(projectId);
  const runMut = useRunQuickAction(projectId);
  const delMut = useDeleteQuickAction(projectId);
  const [editing, setEditing] = useState<QuickAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const actions = data?.actions ?? [];

  const run = async (a: QuickAction) => {
    setStatus(`${a.name} 실행 중…`);
    try {
      const res = await runMut.mutateAsync(a.id);
      if (res.ok) {
        setStatus(`${a.name} 완료`);
        setTimeout(() => setStatus(null), 3000);
      } else {
        const failStep = res.results[res.failedAt ?? 0];
        setStatus(
          `${a.name}: step ${(res.failedAt ?? 0) + 1} 실패 — ${failStep?.error ?? "?"}`,
        );
      }
    } catch (err) {
      setStatus(`실패: ${(err as Error).message}`);
    }
  };

  const remove = (a: QuickAction) => {
    if (confirm(`Quick Action "${a.name}" 삭제할까요?`)) delMut.mutate(a.id);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <Button asChild size="sm" variant="outline">
            <DropdownMenuTrigger>
              <Zap size={12} /> Actions
              {actions.length > 0 && (
                <span className="text-[10px] px-1 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]">
                  {actions.length}
                </span>
              )}
              <ChevronDown size={10} />
            </DropdownMenuTrigger>
          </Button>
          <DropdownMenuContent align="end" className="min-w-[240px]">
            <DropdownMenuItem
              onSelect={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus size={12} /> 새 Quick Action…
            </DropdownMenuItem>
            {actions.length > 0 && <DropdownMenuSeparator />}
            {actions.map((a) => (
              <div
                key={a.id}
                className="group flex items-center gap-1 px-2 py-1 border-b border-[var(--color-border)] last:border-0"
              >
                <button
                  className="flex-1 min-w-0 text-left text-xs truncate hover:text-[var(--color-accent)]"
                  onClick={() => run(a)}
                  title={a.name}
                >
                  <Play size={10} className="inline mr-1" />
                  {a.name}
                  {a.projectId === null && (
                    <span className="ml-1 text-[9px] text-[var(--color-foreground-dim)]">
                      (전역)
                    </span>
                  )}
                </button>
                <button
                  className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    setEditing(a);
                    setDialogOpen(true);
                  }}
                  title="편집"
                >
                  <Pencil size={10} />
                </button>
                <button
                  className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)] opacity-0 group-hover:opacity-100"
                  onClick={() => remove(a)}
                  title="삭제"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {status && (
          <span
            className="text-[10px] text-[var(--color-foreground-muted)] truncate max-w-[300px]"
            title={status}
          >
            {status}
          </span>
        )}
      </div>
      <QuickActionDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </>
  );
}
