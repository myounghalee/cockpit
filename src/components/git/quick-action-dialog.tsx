"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  QuickAction,
  useCreateQuickAction,
  useGitBranches,
  useUpdateQuickAction,
} from "@/hooks/use-git";
import { ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";

type StepType =
  | "fetch"
  | "pull"
  | "push"
  | "checkout"
  | "merge"
  | "rebase"
  | "abort"
  | "stash-save"
  | "stash-pop";

interface Step {
  type: StepType;
  // 가능한 파라미터들 (type에 따라 일부만 유효)
  rebase?: boolean;
  force?: boolean;
  setUpstream?: boolean;
  branch?: string;
  onto?: string;
  noFF?: boolean;
  ffOnly?: boolean;
  squash?: boolean;
  message?: string;
  op?: "merge" | "rebase";
}

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: QuickAction | null;
}

const STEP_LABELS: Record<StepType, string> = {
  fetch: "Fetch --all --prune",
  pull: "Pull",
  push: "Push",
  checkout: "Checkout",
  merge: "Merge",
  rebase: "Rebase",
  abort: "Abort (merge/rebase)",
  "stash-save": "Stash Save",
  "stash-pop": "Stash Pop",
};

export function QuickActionDialog({
  projectId,
  open,
  onOpenChange,
  editing,
}: Props) {
  const { data: branches } = useGitBranches(projectId);
  const createMut = useCreateQuickAction(projectId);
  const updateMut = useUpdateQuickAction(projectId);

  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      try {
        setSteps(JSON.parse(editing.steps) as Step[]);
      } catch {
        setSteps([]);
      }
      setIsGlobal(editing.projectId === null);
    } else {
      setName("");
      setSteps([]);
      setIsGlobal(false);
    }
    setError(null);
  }, [open, editing]);

  const allBranchNames = [
    ...(branches?.local ?? []),
    ...(branches?.remote ?? []),
  ].map((b) => b.name);

  const addStep = () => setSteps((s) => [...s, { type: "fetch" }]);
  const removeStep = (i: number) =>
    setSteps((s) => s.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((s) => {
      const next = s.slice();
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const updateStep = (i: number, patch: Partial<Step>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, name, steps });
      } else {
        await createMut.mutateAsync({ name, steps, global: isGlobal });
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>
          {editing ? "Quick Action 편집" : "새 Quick Action"}
        </DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="text-xs text-[var(--color-foreground-muted)]">
            이름 *
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 업데이트 후 푸시"
              required
            />
          </label>
          {!editing && (
            <label className="flex items-center gap-2 text-xs text-[var(--color-foreground-muted)]">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
              />
              전역 Quick Action (모든 프로젝트에서 사용 가능)
            </label>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-foreground-muted)]">
                Steps ({steps.length})
              </span>
              <Button type="button" size="sm" variant="outline" onClick={addStep}>
                <Plus size={12} /> 추가
              </Button>
            </div>
            {steps.length === 0 && (
              <div className="py-6 text-center text-xs text-[var(--color-foreground-dim)] rounded border border-dashed border-[var(--color-border)]">
                Step을 추가하세요
              </div>
            )}
            <div className="flex flex-col gap-1">
              {steps.map((step, i) => (
                <StepRow
                  key={i}
                  step={step}
                  index={i}
                  total={steps.length}
                  branchNames={allBranchNames}
                  onChange={(patch) => updateStep(i, patch)}
                  onMoveUp={() => moveStep(i, -1)}
                  onMoveDown={() => moveStep(i, 1)}
                  onRemove={() => removeStep(i)}
                />
              ))}
            </div>
          </div>

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
              disabled={
                !name.trim() ||
                steps.length === 0 ||
                createMut.isPending ||
                updateMut.isPending
              }
            >
              {editing ? "저장" : "생성"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({
  step,
  index,
  total,
  branchNames,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  step: Step;
  index: number;
  total: number;
  branchNames: string[];
  onChange: (patch: Partial<Step>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-0.5 rounded text-[var(--color-foreground-dim)] disabled:opacity-30 hover:bg-[var(--color-surface-hover)]"
        >
          <ChevronUp size={10} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-0.5 rounded text-[var(--color-foreground-dim)] disabled:opacity-30 hover:bg-[var(--color-surface-hover)]"
        >
          <ChevronDown size={10} />
        </button>
      </div>
      <span className="text-[10px] font-mono text-[var(--color-foreground-dim)] w-5 text-center">
        {index + 1}
      </span>
      <select
        value={step.type}
        onChange={(e) => onChange({ type: e.target.value as StepType })}
        className="h-7 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
      >
        {(Object.keys(STEP_LABELS) as StepType[]).map((t) => (
          <option key={t} value={t}>
            {STEP_LABELS[t]}
          </option>
        ))}
      </select>
      <StepParams step={step} branchNames={branchNames} onChange={onChange} />
      <div className="flex-1" />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded text-[var(--color-foreground-dim)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-hover)]"
        title="삭제"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function StepParams({
  step,
  branchNames,
  onChange,
}: {
  step: Step;
  branchNames: string[];
  onChange: (patch: Partial<Step>) => void;
}) {
  const selectCls =
    "h-7 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs";
  switch (step.type) {
    case "pull":
      return (
        <label className="text-[10px] flex items-center gap-1 text-[var(--color-foreground-muted)]">
          <input
            type="checkbox"
            checked={!!step.rebase}
            onChange={(e) => onChange({ rebase: e.target.checked })}
          />
          --rebase
        </label>
      );
    case "push":
      return (
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-foreground-muted)]">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!step.setUpstream}
              onChange={(e) => onChange({ setUpstream: e.target.checked })}
            />
            -u
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!step.force}
              onChange={(e) => onChange({ force: e.target.checked })}
            />
            --force-with-lease
          </label>
        </div>
      );
    case "checkout":
      return (
        <select
          value={step.branch ?? ""}
          onChange={(e) => onChange({ branch: e.target.value })}
          className={selectCls}
        >
          <option value="">브랜치…</option>
          {branchNames.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      );
    case "merge":
      return (
        <div className="flex items-center gap-1">
          <select
            value={step.branch ?? ""}
            onChange={(e) => onChange({ branch: e.target.value })}
            className={selectCls}
          >
            <option value="">브랜치…</option>
            {branchNames.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <label className="text-[10px] flex items-center gap-1 text-[var(--color-foreground-muted)]">
            <input
              type="checkbox"
              checked={!!step.noFF}
              onChange={(e) => onChange({ noFF: e.target.checked })}
            />
            --no-ff
          </label>
        </div>
      );
    case "rebase":
      return (
        <select
          value={step.onto ?? ""}
          onChange={(e) => onChange({ onto: e.target.value })}
          className={selectCls}
        >
          <option value="">onto…</option>
          {branchNames.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      );
    case "abort":
      return (
        <select
          value={step.op ?? "merge"}
          onChange={(e) =>
            onChange({ op: e.target.value as "merge" | "rebase" })
          }
          className={selectCls}
        >
          <option value="merge">merge</option>
          <option value="rebase">rebase</option>
        </select>
      );
    case "stash-save":
      return (
        <input
          type="text"
          value={step.message ?? ""}
          onChange={(e) => onChange({ message: e.target.value })}
          placeholder="메시지 (선택)"
          className="h-7 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
        />
      );
    default:
      return null;
  }
}
