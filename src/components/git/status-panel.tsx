"use client";

import {
  FileText,
  FilePlus,
  FileQuestion,
  Plus,
  Minus,
  Undo2,
} from "lucide-react";
import {
  useDiscard,
  useGitStatus,
  useStage,
  useUnstage,
} from "@/hooks/use-git";
import { cn } from "@/lib/utils";
import { CommitBox } from "./commit-box";

interface Props {
  projectId: string;
  onSelectFile?: (path: string, staged: boolean, untracked?: boolean) => void;
  selectedFile?: {
    path: string;
    staged: boolean;
    untracked?: boolean;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  U: "unmerged",
};

export function StatusPanel({ projectId, onSelectFile, selectedFile }: Props) {
  const { data, isLoading } = useGitStatus(projectId);
  const stage = useStage(projectId);
  const unstage = useUnstage(projectId);
  const discard = useDiscard(projectId);

  if (isLoading) {
    return <div className="p-3 text-xs text-[var(--color-foreground-muted)]">…</div>;
  }
  if (!data) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-2">
        <Section
          title="Staged"
          count={data.staged.length}
          empty="스테이징된 파일 없음"
          headerAction={
            data.staged.length > 0 ? (
              <button
                className="text-[10px] text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]"
                onClick={() =>
                  unstage.mutate(data.staged.map((f) => f.path))
                }
                disabled={unstage.isPending}
              >
                모두 취소
              </button>
            ) : null
          }
        >
          {data.staged.map((f) => (
            <FileRow
              key={`s-${f.path}`}
              icon={<FilePlus size={11} />}
              path={f.path}
              status={f.status}
              tone="success"
              selected={
                selectedFile?.path === f.path && selectedFile.staged === true
              }
              onClick={() => onSelectFile?.(f.path, true)}
              actions={
                <button
                  className="p-0.5 rounded hover:bg-[var(--color-background)] text-[var(--color-foreground-dim)]"
                  title="Unstage"
                  onClick={(e) => {
                    e.stopPropagation();
                    unstage.mutate([f.path]);
                  }}
                >
                  <Minus size={10} />
                </button>
              }
            />
          ))}
        </Section>
        <Section
          title="Changes"
          count={data.unstaged.length}
          empty="변경 없음"
          headerAction={
            data.unstaged.length > 0 ? (
              <button
                className="text-[10px] text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]"
                onClick={() => stage.mutate({ all: true })}
                disabled={stage.isPending}
              >
                전체 +
              </button>
            ) : null
          }
        >
          {data.unstaged.map((f) => (
            <FileRow
              key={`u-${f.path}`}
              icon={<FileText size={11} />}
              path={f.path}
              status={f.status}
              tone="warning"
              selected={
                selectedFile?.path === f.path && selectedFile.staged === false
              }
              onClick={() => onSelectFile?.(f.path, false)}
              actions={
                <>
                  <button
                    className="p-0.5 rounded hover:bg-[var(--color-background)] text-[var(--color-foreground-dim)]"
                    title="Stage"
                    onClick={(e) => {
                      e.stopPropagation();
                      stage.mutate({ paths: [f.path] });
                    }}
                  >
                    <Plus size={10} />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-[var(--color-danger)]/20 text-[var(--color-foreground-dim)] hover:text-[var(--color-danger)]"
                    title="변경 되돌리기"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`"${f.path}" 의 변경을 되돌릴까요?`)) {
                        discard.mutate([f.path]);
                      }
                    }}
                  >
                    <Undo2 size={10} />
                  </button>
                </>
              }
            />
          ))}
        </Section>
        <Section
          title="Untracked"
          count={data.untracked.length}
          empty="추적되지 않은 파일 없음"
          headerAction={
            data.untracked.length > 0 ? (
              <button
                className="text-[10px] text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]"
                onClick={() => stage.mutate({ paths: data.untracked })}
                disabled={stage.isPending}
              >
                전체 +
              </button>
            ) : null
          }
        >
          {data.untracked.map((p) => {
            const isDir = p.endsWith("/");
            return (
            <FileRow
              key={`n-${p}`}
              icon={<FileQuestion size={11} />}
              path={p}
              status={isDir ? "?/" : "?"}
              tone="muted"
              selected={
                selectedFile?.path === p && selectedFile.untracked === true
              }
              onClick={
                isDir ? undefined : () => onSelectFile?.(p, false, true)
              }
              actions={
                <button
                  className="p-0.5 rounded hover:bg-[var(--color-background)] text-[var(--color-foreground-dim)]"
                  title="Stage"
                  onClick={(e) => {
                    e.stopPropagation();
                    stage.mutate({ paths: [p] });
                  }}
                >
                  <Plus size={10} />
                </button>
              }
            />
            );
          })}
        </Section>
      </div>
      <CommitBox projectId={projectId} />
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  headerAction,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-foreground-muted)] mb-1 px-1">
        <span>{title}</span>
        <span className="text-[var(--color-foreground-dim)]">{count}</span>
        <div className="flex-1" />
        {headerAction}
      </div>
      {count === 0 ? (
        <div className="px-2 py-1 text-[10px] text-[var(--color-foreground-dim)]">
          {empty}
        </div>
      ) : (
        <div className="flex flex-col">{children}</div>
      )}
    </div>
  );
}

function FileRow({
  icon,
  path,
  status,
  tone,
  selected,
  onClick,
  actions,
}: {
  icon: React.ReactNode;
  path: string;
  status: string;
  tone: "success" | "warning" | "muted";
  selected?: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--color-success)]"
      : tone === "warning"
        ? "text-[var(--color-warning)]"
        : "text-[var(--color-foreground-dim)]";
  return (
    <button
      className={cn(
        "group flex items-center gap-2 px-2 py-1 text-xs rounded text-left",
        "hover:bg-[var(--color-surface-hover)]",
        selected && "bg-[var(--color-accent)]/15",
        toneClass,
      )}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 min-w-0 truncate text-[var(--color-foreground)]">
        {path}
      </span>
      <span
        className="font-mono text-[10px]"
        title={STATUS_LABEL[status.trim()] ?? status}
      >
        {status.trim() || "?"}
      </span>
      {actions && (
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </span>
      )}
    </button>
  );
}
