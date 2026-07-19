"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileDiff, GitCommitHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { BranchPicker } from "./branch-picker";
import { StatusPanel } from "./status-panel";
import { CommitGraph } from "./commit-graph";
import { CommitDetail } from "./commit-detail";
import { DiffViewer } from "./diff-viewer";
import { PushPullBar } from "./push-pull-bar";
import { ConflictBanner } from "./conflict-banner";

/**
 * 분할 pane 안에 들어가는 축약형 Git 화면.
 *
 * 전체 화면용 GitBoard는 3단 고정폭(300 + 320 + 520px)이라 분할 pane에서는
 * 가로 스크롤이 터진다. 여기서는 같은 하위 컴포넌트를 재사용하되 폭에 따라
 * 레이아웃을 바꾼다 — 넓으면 목록+상세 2단, 좁으면 목록에서 상세로 드릴인.
 */
const TWO_COLUMN_MIN_WIDTH = 820;

interface Props {
  projectId: string;
  /** 헤더 좌측에 끼워 넣을 프로젝트 선택기 (pane이 주입) */
  projectSelect?: React.ReactNode;
}

type Tab = "changes" | "commits";

interface FileSelection {
  path: string;
  staged: boolean;
  untracked?: boolean;
}

export function GitPaneContent({ projectId, projectSelect }: Props) {
  const [tab, setTab] = useState<Tab>("changes");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [workingFile, setWorkingFile] = useState<FileSelection | null>(null);
  const { ref, wide } = useIsWide(TWO_COLUMN_MIN_WIDTH);

  // 프로젝트가 바뀌면 이전 프로젝트의 선택이 남지 않도록 초기화
  useEffect(() => {
    setSelectedHash(null);
    setWorkingFile(null);
  }, [projectId]);

  const selectCommit = (hash: string) => {
    setSelectedHash(hash);
    setWorkingFile(null);
  };
  const selectFile = (path: string, staged: boolean, untracked?: boolean) => {
    setWorkingFile({ path, staged, untracked });
    setSelectedHash(null);
  };
  const clearSelection = () => {
    setSelectedHash(null);
    setWorkingFile(null);
  };

  const hasSelection = !!workingFile || !!selectedHash;
  // 좁을 때는 목록과 상세가 같은 자리를 공유한다 (드릴인)
  const showList = wide || !hasSelection;
  const showDetail = wide || hasSelection;

  const detail = workingFile ? (
    <WorkingFileDiff projectId={projectId} file={workingFile} />
  ) : (
    <CommitDetail projectId={projectId} hash={selectedHash} />
  );

  return (
    <div ref={ref} className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border)] flex-shrink-0">
        {projectSelect}
        <BranchPicker projectId={projectId} />
        <div className="flex-1" />
        {wide && <PushPullBar projectId={projectId} />}
      </header>

      <ConflictBanner projectId={projectId} />

      <div className="flex-1 flex min-h-0">
        {showList && (
          <div
            className={cn(
              "flex flex-col min-h-0",
              wide ? "w-[300px] shrink-0 border-r border-[var(--color-border)]" : "flex-1",
            )}
          >
            <div className="flex items-center gap-0 border-b border-[var(--color-border)] flex-shrink-0">
              <TabButton
                active={tab === "changes"}
                onClick={() => setTab("changes")}
                icon={<FileDiff size={11} />}
                label="변경사항"
              />
              <TabButton
                active={tab === "commits"}
                onClick={() => setTab("commits")}
                icon={<GitCommitHorizontal size={11} />}
                label="커밋"
              />
            </div>
            <div className="flex-1 min-h-0">
              {tab === "changes" ? (
                <StatusPanel
                  projectId={projectId}
                  onSelectFile={selectFile}
                  selectedFile={workingFile}
                />
              ) : (
                <CommitGraph
                  projectId={projectId}
                  selectedHash={selectedHash}
                  onSelect={selectCommit}
                />
              )}
            </div>
          </div>
        )}

        {showDetail && (
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {!wide && (
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 px-2 h-7 flex-shrink-0 border-b border-[var(--color-border)] text-[11px] text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                <ArrowLeft size={11} />
                목록으로
              </button>
            )}
            <div className="flex-1 min-h-0">{detail}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 선택된 워킹 트리 파일의 diff */
function WorkingFileDiff({
  projectId,
  file,
}: {
  projectId: string;
  file: FileSelection;
}) {
  const label = file.untracked
    ? "UNTRACKED"
    : file.staged
      ? "STAGED"
      : "WORKING TREE";
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-1.5 border-b border-[var(--color-border)] flex-shrink-0 flex items-center gap-2 text-[10px] font-mono">
        <span className="px-1.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] flex-shrink-0">
          {label}
        </span>
        <span className="truncate">{file.path}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <DiffViewer
          projectId={projectId}
          path={file.path}
          staged={file.staged}
          untracked={file.untracked}
        />
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2.5 h-7 text-[11px] border-b-2 -mb-px",
        active
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-transparent text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** 컨테이너 실제 폭을 관찰해 2단/1단 레이아웃을 고른다 (뷰포트가 아니라 pane 폭 기준) */
function useIsWide(threshold: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= threshold);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);

  return { ref, wide };
}
