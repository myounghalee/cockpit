"use client";

import { useTerminalStore } from "@/store/terminal-store";
import { GitPaneContent } from "@/components/git/git-pane-content";
import { ProjectSelect } from "@/components/projects/project-select";

interface Props {
  tabId: string;
  projectId: string;
}

/** 탭 레벨 Git 뷰어 — memo-pane 과 동일 패턴. */
export function GitPane({ tabId, projectId }: Props) {
  const setPaneProject = useTerminalStore((s) => s.setPaneProject);

  const projectSelect = (
    <ProjectSelect
      value={projectId || null}
      onChange={(id) => setPaneProject(tabId, id)}
      allLabel={null}
      placeholder="프로젝트 선택"
      className="h-7"
    />
  );

  if (!projectId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-[var(--color-foreground-muted)]">
          Git을 볼 프로젝트를 선택하세요.
        </p>
        {projectSelect}
      </div>
    );
  }

  return (
    <GitPaneContent
      key={projectId}
      projectId={projectId}
      projectSelect={projectSelect}
    />
  );
}
