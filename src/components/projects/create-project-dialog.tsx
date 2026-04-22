"use client";

import { useState } from "react";
import { useCreateProject } from "@/hooks/use-projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ProjectFolder } from "@/types/project";
import { FolderOpen, FolderPlus } from "lucide-react";
import { FolderPickerDialog } from "./folder-picker-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: ProjectFolder[];
  defaultFolderId?: string | null;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
}: Props) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | "">(defaultFolderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [multiPickerOpen, setMultiPickerOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const mutation = useCreateProject();

  const reset = () => {
    setPath("");
    setName("");
    setFolderId(defaultFolderId ?? "");
    setError(null);
    setProgress(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({
        path: path.trim(),
        name: name.trim() || undefined,
        folderId: folderId || null,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleMultiPick(paths: string[]) {
    setError(null);
    setProgress({ done: 0, total: paths.length });
    const failed: string[] = [];
    let done = 0;
    for (const p of paths) {
      try {
        await mutation.mutateAsync({
          path: p,
          folderId: folderId || null,
        });
      } catch (err) {
        const name = p.split("/").pop() ?? p;
        failed.push(`${name}: ${(err as Error).message}`);
      }
      done++;
      setProgress({ done, total: paths.length });
    }
    setProgress(null);
    if (failed.length > 0) {
      setError(
        `${done - failed.length}/${paths.length} 등록 · 실패 ${failed.length}개\n${failed.slice(0, 5).join("\n")}`,
      );
    } else {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogTitle>프로젝트 등록</DialogTitle>
        <DialogDescription>
          단일 폴더 경로를 입력하거나, 여러 폴더를 한번에 선택하여 일괄 등록할 수 있습니다.
        </DialogDescription>

        {/* 다중 선택 버튼 */}
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMultiPickerOpen(true)}
            className="w-full justify-start"
          >
            <FolderPlus size={14} />
            폴더 다중 선택 (하위 폴더들을 일괄 등록)
          </Button>
        </div>

        <div className="my-3 flex items-center gap-2">
          <div className="flex-1 h-px bg-[var(--color-border)]" />
          <span className="text-[10px] text-[var(--color-foreground-dim)] uppercase">
            또는 개별 등록
          </span>
          <div className="flex-1 h-px bg-[var(--color-border)]" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="text-xs text-[var(--color-foreground-muted)]">
            경로 *
            <div className="flex gap-1 mt-1">
              <Input
                autoFocus
                placeholder="/Users/you/projects/my-app"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPickerOpen(true)}
                title="폴더 선택"
                aria-label="폴더 선택"
                className="h-9 w-9 shrink-0"
              >
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>

          <label className="text-xs text-[var(--color-foreground-muted)]">
            이름 (비우면 경로의 마지막 폴더명 사용)
            <Input
              placeholder="My App"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="text-xs text-[var(--color-foreground-muted)]">
            폴더
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)]"
            >
              <option value="">(미분류)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          {progress && (
            <div className="text-xs text-[var(--color-foreground-muted)]">
              등록 중… {progress.done}/{progress.total}
            </div>
          )}
          {error && (
            <div className="text-xs text-[var(--color-danger)] whitespace-pre-wrap">
              {error}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending || !!progress}>
              {mutation.isPending ? "등록 중…" : "등록"}
            </Button>
          </div>
        </form>

        {/* 단일 선택 */}
        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={(absPath) => setPath(absPath)}
          initialPath={path || undefined}
        />

        {/* 다중 선택 */}
        <FolderPickerDialog
          open={multiPickerOpen}
          onOpenChange={setMultiPickerOpen}
          onPickMultiple={handleMultiPick}
          initialPath={path || undefined}
        />
      </DialogContent>
    </Dialog>
  );
}
