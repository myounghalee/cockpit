"use client";

import { useProjectScope } from "@/store/project-scope-store";
import { useProject } from "@/hooks/use-projects";
import { GitBranch, Sparkles } from "lucide-react";
import { GitBoard } from "@/components/git/board";
import { ProjectSelect } from "@/components/projects/project-select";

export default function GitPage() {
  const [projectId, setProjectId] = useProjectScope("git");
  const { data: project, isLoading } = useProject(projectId);

  const selector = (
    <ProjectSelect
      value={projectId}
      onChange={setProjectId}
      allLabel={null}
      placeholder="프로젝트 선택"
    />
  );

  if (projectId && isLoading) {
    return (
      <Shell selector={selector}>
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-foreground-muted)]">
          …
        </div>
      </Shell>
    );
  }
  if (!projectId) {
    return (
      <Shell selector={selector}>
        <EmptyState message="위에서 프로젝트를 선택하세요." />
      </Shell>
    );
  }
  if (!project) {
    return (
      <Shell selector={selector}>
        <EmptyState message="프로젝트를 찾을 수 없습니다." />
      </Shell>
    );
  }
  if (!project.isGitRepo) {
    return (
      <Shell selector={selector}>
        <EmptyState
          message={`"${project.name}"은 git 저장소가 아닙니다.`}
          hint={`${project.path} 에서 'git init' 후 다시 시도하세요.`}
        />
      </Shell>
    );
  }

  return <GitBoard key={project.id} projectId={project.id} projectSelect={selector} />;
}

/** 보드를 띄울 수 없는 상태에서도 프로젝트를 바꿀 수 있도록 헤더를 유지한다. */
function Shell({
  selector,
  children,
}: {
  selector: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)]">
        {selector}
      </header>
      {children}
    </div>
  );
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
