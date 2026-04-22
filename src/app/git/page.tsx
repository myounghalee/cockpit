"use client";

import { useActiveProjectStore } from "@/store/active-project-store";
import { useProject } from "@/hooks/use-projects";
import { GitBranch, Sparkles } from "lucide-react";
import { GitBoard } from "@/components/git/board";

export default function GitPage() {
  const activeId = useActiveProjectStore((s) => s.activeProjectId);
  const { data: project, isLoading } = useProject(activeId);

  if (!activeId) {
    return <EmptyState message="활성 프로젝트를 먼저 선택하세요." />;
  }
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-foreground-muted)]">
        …
      </div>
    );
  }
  if (!project) {
    return <EmptyState message="프로젝트를 찾을 수 없습니다." />;
  }
  if (!project.isGitRepo) {
    return (
      <EmptyState
        message={`"${project.name}"은 git 저장소가 아닙니다.`}
        hint={`${project.path} 에서 'git init' 후 다시 시도하세요.`}
      />
    );
  }

  return <GitBoard key={project.id} projectId={project.id} projectName={project.name} />;
}

function EmptyState({
  message,
  hint,
}: {
  message: string;
  hint?: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-lg bg-[var(--color-accent)]/15 flex items-center justify-center mb-4">
          <GitBranch size={28} className="text-[var(--color-accent)]" />
        </div>
        <h1 className="text-xl font-semibold mb-2 flex items-center justify-center gap-2">
          Git
          <span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--color-accent)] bg-[var(--color-accent)]/15 px-2 py-0.5 rounded">
            <Sparkles size={12} /> Cycle 4a
          </span>
        </h1>
        <p className="text-sm text-[var(--color-foreground-muted)]">{message}</p>
        {hint && (
          <p className="text-xs text-[var(--color-foreground-dim)] mt-2">{hint}</p>
        )}
      </div>
    </div>
  );
}
