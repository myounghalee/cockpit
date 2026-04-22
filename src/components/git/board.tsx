"use client";

import { useState } from "react";
import { BranchPicker } from "./branch-picker";
import { StatusPanel } from "./status-panel";
import { CommitGraph } from "./commit-graph";
import { CommitDetail } from "./commit-detail";
import { DiffViewer } from "./diff-viewer";
import { PushPullBar } from "./push-pull-bar";
import { StashMenu } from "./stash-menu";
import { QuickActionsMenu } from "./quick-actions-menu";
import { ConflictBanner } from "./conflict-banner";

interface Props {
  projectId: string;
  projectName: string;
}

interface WorkingFileSelection {
  path: string;
  staged: boolean;
  untracked?: boolean;
}

export function GitBoard({ projectId, projectName }: Props) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [workingFile, setWorkingFile] = useState<WorkingFileSelection | null>(
    null,
  );

  // 커밋 선택 시 working file 선택 해제, 반대도 마찬가지
  const selectCommit = (hash: string) => {
    setSelectedHash(hash);
    setWorkingFile(null);
  };
  const selectWorkingFile = (
    path: string,
    staged: boolean,
    untracked?: boolean,
  ) => {
    setWorkingFile({ path, staged, untracked });
    setSelectedHash(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 상단 툴바 */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)] flex-wrap">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{projectName}</h1>
        </div>
        <BranchPicker projectId={projectId} />
        <div className="flex-1" />
        <PushPullBar projectId={projectId} />
        <StashMenu projectId={projectId} />
        <QuickActionsMenu projectId={projectId} />
      </header>

      {/* 충돌 배너 (머지/리베이스 진행 중이면 표시) */}
      <ConflictBanner projectId={projectId} />

      {/* 본문 */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-[300px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]/30">
          <StatusPanel
            projectId={projectId}
            onSelectFile={selectWorkingFile}
            selectedFile={workingFile}
          />
        </aside>
        <section className="flex-1 min-w-[320px] border-r border-[var(--color-border)] overflow-hidden">
          <CommitGraph
            projectId={projectId}
            selectedHash={selectedHash}
            onSelect={selectCommit}
          />
        </section>
        <aside className="w-[55%] shrink-0 min-w-[520px] overflow-hidden">
          {workingFile ? (
            <WorkingFileDiff
              projectId={projectId}
              file={workingFile}
              onClear={() => setWorkingFile(null)}
            />
          ) : (
            <CommitDetail projectId={projectId} hash={selectedHash} />
          )}
        </aside>
      </div>
    </div>
  );
}

function WorkingFileDiff({
  projectId,
  file,
  onClear,
}: {
  projectId: string;
  file: WorkingFileSelection;
  onClear: () => void;
}) {
  const label = file.untracked
    ? "UNTRACKED"
    : file.staged
      ? "STAGED"
      : "WORKING TREE";
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="px-1.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]">
            {label}
          </span>
          <span className="text-[var(--color-foreground-dim)]">·</span>
          <span className="truncate flex-1">{file.path}</span>
          <button
            onClick={onClear}
            className="text-[10px] text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]"
          >
            닫기
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <DiffViewer
          projectId={projectId}
          commit={undefined}
          path={file.path}
          staged={file.staged}
          untracked={file.untracked}
        />
      </div>
    </div>
  );
}
