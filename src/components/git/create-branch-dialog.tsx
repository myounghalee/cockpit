"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateBranch, useGitBranches } from "@/hooks/use-git";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBranchDialog({ projectId, open, onOpenChange }: Props) {
  const { data: branches } = useGitBranches(projectId);
  const mut = useCreateBranch(projectId);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setFrom(branches?.current ?? "");
      setError(null);
    }
  }, [open, branches]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await mut.mutateAsync({ name: name.trim(), from: from || undefined });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const allRefs = [
    ...(branches?.local ?? []),
    ...(branches?.remote ?? []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>새 브랜치</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="text-xs text-[var(--color-foreground-muted)]">
            이름 *
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="feat/new-stuff"
              pattern="[\w./-]+"
              required
            />
          </label>
          <label className="text-xs text-[var(--color-foreground-muted)]">
            시작점
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm font-mono"
            >
              <option value="">현재 HEAD</option>
              {allRefs.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <div className="text-xs text-[var(--color-danger)]">{error}</div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || mut.isPending}
            >
              {mut.isPending ? "생성 중…" : "생성"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
