"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/hooks/use-projects";
import { useCreateMemo } from "@/hooks/use-memos";
import { useActiveProjectStore } from "@/store/active-project-store";

interface NewMemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (memoId: string) => void;
  /** 기본 프로젝트 ID — 미지정 시 활성 프로젝트 사용. "__global__"로 전역 메모 기본 설정. */
  defaultProjectId?: string | "__global__";
}

export function NewMemoDialog({
  open,
  onOpenChange,
  onCreated,
  defaultProjectId,
}: NewMemoDialogProps) {
  const { data } = useProjects();
  const projects = data?.projects ?? [];
  const activeId = useActiveProjectStore((s) => s.activeProjectId);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState<string>("");

  const create = useCreateMemo();

  // 다이얼로그가 열릴 때마다 기본값 리셋
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setContent("");
    setTags("");
    const initial =
      defaultProjectId === "__global__"
        ? "__global__"
        : (defaultProjectId ?? activeId ?? "__global__");
    setProjectId(initial);
  }, [open, defaultProjectId, activeId]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        projectId: projectId === "__global__" ? null : projectId,
        title: title.trim(),
        content,
        tags: tags.trim(),
      },
      {
        onSuccess: (memo) => {
          onCreated?.(memo.id);
          onOpenChange(false);
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle>새 메모</DialogTitle>
        <DialogDescription>
          빠르게 아이디어를 기록하세요. ⌘Enter로 저장.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <Input
            autoFocus
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <textarea
            placeholder="내용 (optional)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none font-mono"
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="태그 (예: 아이디어, 버그)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              <option value="__global__">전역 메모 (프로젝트 없음)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? "저장 중..." : "저장 (⌘Enter)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
