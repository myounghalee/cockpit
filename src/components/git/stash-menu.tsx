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
import { useStashList, useStashMutation } from "@/hooks/use-git";
import { Archive, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  projectId: string;
}

export function StashMenu({ projectId }: Props) {
  const { data } = useStashList(projectId);
  const mut = useStashMutation(projectId);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const stashes = data?.stashes ?? [];

  const run = async (
    action: "save" | "pop" | "drop" | "apply",
    index?: number,
    message?: string,
  ) => {
    try {
      await mut.mutateAsync({ action, index, message });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const doSave = async () => {
    await run("save", undefined, saveMsg.trim() || undefined);
    setSaveMsg("");
    setSaveOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <Button asChild size="sm" variant="outline">
          <DropdownMenuTrigger>
            <Archive size={12} /> Stash
            {stashes.length > 0 && (
              <span className="text-[10px] px-1 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]">
                {stashes.length}
              </span>
            )}
            <ChevronDown size={10} />
          </DropdownMenuTrigger>
        </Button>
        <DropdownMenuContent align="end" className="min-w-[240px]">
          <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
            저장 (현재 변경 stash)
          </DropdownMenuItem>
          {stashes.length > 0 && <DropdownMenuSeparator />}
          {stashes.map((s) => (
            <div
              key={s.ref}
              className="flex flex-col px-2 py-1 border-b border-[var(--color-border)] last:border-0"
            >
              <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-foreground-muted)]">
                <span>{s.ref}</span>
                <span>·</span>
                <span>{s.ago}</span>
              </div>
              <div className="text-xs truncate" title={s.subject}>
                {s.subject}
              </div>
              <div className="flex gap-1 mt-1">
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  onClick={() => run("pop", s.index)}
                >
                  pop
                </button>
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
                  onClick={() => run("apply", s.index)}
                >
                  apply
                </button>
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
                  onClick={() => {
                    if (confirm(`${s.ref} 삭제할까요?`)) run("drop", s.index);
                  }}
                >
                  drop
                </button>
              </div>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogTitle>Stash 저장</DialogTitle>
          <div className="mt-3 space-y-2">
            <Input
              autoFocus
              value={saveMsg}
              onChange={(e) => setSaveMsg(e.target.value)}
              placeholder="메시지 (선택)"
              onKeyDown={(e) => {
                if (e.key === "Enter") void doSave();
              }}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              취소
            </Button>
            <Button onClick={doSave}>저장</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
