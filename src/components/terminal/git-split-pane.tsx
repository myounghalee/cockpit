"use client";

import {
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
  FileText,
  Globe,
  GitBranch,
} from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";
import type { TerminalPane as TerminalPaneType } from "@/types/terminal";
import { GitPaneContent } from "@/components/git/git-pane-content";
import { ProjectSelect } from "@/components/projects/project-select";
import { usePaneDnd } from "./use-pane-dnd";
import { cn } from "@/lib/utils";

interface Props {
  pane: TerminalPaneType;
  isActive: boolean;
  onFocus: () => void;
}

export function GitSplitPane({ pane, onFocus }: Props) {
  const splitPane = useTerminalStore((s) => s.splitPane);
  const closePane = useTerminalStore((s) => s.closePane);
  const setPaneProject = useTerminalStore((s) => s.setPaneProject);
  const dnd = usePaneDnd(pane.id);

  const projectId = pane.projectId ?? null;

  const projectSelect = (
    <ProjectSelect
      value={projectId}
      onChange={(id) => setPaneProject(pane.id, id)}
      allLabel={null}
      placeholder="프로젝트 선택"
      className="h-7"
    />
  );

  return (
    <div
      className={cn(
        "relative flex flex-col h-full min-h-0 bg-[var(--color-background)] border border-transparent group",
        dnd.isDragOver && "border-[var(--color-accent)]",
      )}
      onMouseDown={onFocus}
      onClick={onFocus}
      {...dnd.rootProps}
    >
      <div
        {...dnd.handleProps}
        className="flex items-center justify-between h-7 px-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-muted)] cursor-grab active:cursor-grabbing"
      >
        <span className="flex items-center gap-1 truncate">
          <GitBranch size={11} className="flex-shrink-0 opacity-70" />
          {pane.title}
        </span>
        <div
          className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => splitPane(pane.id, "horizontal")}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
            title="오른쪽으로 분할 (터미널)"
          >
            <SplitSquareHorizontal size={12} />
          </button>
          <button
            onClick={() => splitPane(pane.id, "vertical")}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
            title="아래로 분할 (터미널)"
          >
            <SplitSquareVertical size={12} />
          </button>
          <button
            onClick={() => splitPane(pane.id, "horizontal", { type: "browser" })}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
            title="오른쪽에 브라우저 분할"
          >
            <Globe size={12} />
          </button>
          <button
            onClick={() => splitPane(pane.id, "horizontal", { type: "file" })}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
            title="오른쪽에 파일 뷰어 분할"
          >
            <FileText size={12} />
          </button>
          <button
            onClick={() => closePane(pane.id)}
            className="p-1 rounded hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)]"
            title="패인 닫기"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {projectId ? (
          <GitPaneContent
            key={projectId}
            projectId={projectId}
            projectSelect={projectSelect}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-xs text-[var(--color-foreground-muted)]">
              이 터미널의 경로에서 등록된 프로젝트를 찾지 못했습니다.
            </p>
            {projectSelect}
          </div>
        )}
      </div>
    </div>
  );
}
