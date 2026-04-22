"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Terminal as TerminalIcon,
  KanbanSquare,
  GitBranch,
  Star,
  GitCommit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { useActiveProjectStore } from "@/store/active-project-store";
import { useProjectViewerStore } from "@/store/project-viewer-store";
import { FileTree } from "./file-tree";
import { FileViewerPanel } from "./file-viewer-panel";
import { OpenInEditorButton } from "./open-in-editor-button";

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { data: project, isLoading, error } = useProject(projectId);
  const updateMut = useUpdateProject();
  const setActive = useActiveProjectStore((s) => s.setActive);
  const activeId = useActiveProjectStore((s) => s.activeProjectId);
  const router = useRouter();

  // 선택한 파일을 projectId별로 영속 저장 → 네비게이션 간 유지
  const selectedFile = useProjectViewerStore(
    (s) => s.selectedFileByProject[projectId] ?? null,
  );
  const setSelectedFile = useProjectViewerStore((s) => s.setSelectedFile);

  // 상세 진입 시 자동으로 활성 프로젝트로 설정
  useEffect(() => {
    if (project && activeId !== project.id) {
      setActive(project.id, project.path);
    }
  }, [project, activeId, setActive]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-[var(--color-foreground-muted)]">
        불러오는 중…
      </div>
    );
  }
  if (error || !project) {
    return (
      <div className="p-6 text-sm text-[var(--color-danger)]">
        프로젝트를 찾을 수 없습니다.
      </div>
    );
  }

  const openTerminal = () => {
    router.push(`/terminal?newTabCwd=${encodeURIComponent(project.path)}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-6 gap-4">
      {/* 헤더 */}
      <header className="flex items-start gap-3 flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <button
              onClick={() =>
                updateMut.mutate({
                  id: project.id,
                  isFavorite: !project.isFavorite,
                })
              }
              className={`p-1 rounded hover:bg-[var(--color-surface-hover)] ${
                project.isFavorite
                  ? "text-[var(--color-warning)]"
                  : "text-[var(--color-foreground-dim)]"
              }`}
              aria-label="즐겨찾기"
              title="즐겨찾기"
            >
              <Star
                size={14}
                fill={project.isFavorite ? "currentColor" : "none"}
              />
            </button>
            {project.isGitRepo && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success)] bg-[var(--color-success)]/15 px-2 py-0.5 rounded">
                <GitCommit size={11} /> git repo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--color-foreground-muted)] font-mono break-all">
            {project.path}
          </p>
        </div>
      </header>

      {/* 액션 */}
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <Button onClick={openTerminal}>
          <TerminalIcon size={14} /> 터미널 열기
        </Button>
        <OpenInEditorButton
          path={project.path}
          className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-hover)]"
          iconSize={14}
          label="에디터로 열기"
        />
        <Button variant="outline" onClick={() => router.push("/kanban")}>
          <KanbanSquare size={14} /> 칸반
        </Button>
        {project.isGitRepo && (
          <Button variant="outline" onClick={() => router.push("/git")}>
            <GitBranch size={14} /> Git
          </Button>
        )}
      </div>

      {/* 파일 트리 + 뷰어 (좌우 분할) */}
      <section className="flex-1 min-h-0 flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-[var(--color-foreground-muted)] uppercase tracking-wider flex-shrink-0">
          파일
        </h2>
        <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr] gap-3">
          {/* 파일 트리 */}
          <div className="min-h-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/30 overflow-hidden">
            <FileTree
              projectId={project.id}
              selectedRelPath={selectedFile?.relPath ?? null}
              onSelectFile={(file) => setSelectedFile(project.id, file)}
            />
          </div>

          {/* 뷰어 */}
          <div className="min-h-0 min-w-0">
            {selectedFile ? (
              <FileViewerPanel
                key={selectedFile.relPath}
                projectId={project.id}
                relPath={selectedFile.relPath}
                absolutePath={selectedFile.absolutePath}
                name={selectedFile.name}
                onClose={() => setSelectedFile(project.id, null)}
              />
            ) : (
              <div className="h-full flex items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-xs text-[var(--color-foreground-dim)] p-4 text-center">
                파일을 클릭하면 여기에 내용이 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
