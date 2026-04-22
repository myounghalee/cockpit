"use client";

import { useEffect, useState } from "react";
import { useUpdateProject } from "@/hooks/use-projects";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Project, ProjectFolder } from "@/types/project";

interface Props {
  project: Project | null;
  folders: ProjectFolder[];
  onClose: () => void;
}

export function EditProjectDialog({ project, folders, onClose }: Props) {
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateProject();

  useEffect(() => {
    if (project) {
      setName(project.name);
      setFolderId(project.folderId ?? "");
      setError(null);
    }
  }, [project]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setError(null);
    try {
      await mutation.mutateAsync({
        id: project.id,
        name: name.trim() || project.name,
        folderId: folderId || null,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle>프로젝트 수정</DialogTitle>
        {project && (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <div className="text-xs text-[var(--color-foreground-dim)]">
              경로: <span className="font-mono">{project.path}</span>
            </div>
            <label className="text-xs text-[var(--color-foreground-muted)]">
              이름
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
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
            {error && (
              <div className="text-xs text-[var(--color-danger)]">{error}</div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                저장
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
