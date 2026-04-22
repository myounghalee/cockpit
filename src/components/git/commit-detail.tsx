"use client";

import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useGitCommit } from "@/hooks/use-git";
import { DiffViewer } from "./diff-viewer";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

interface Props {
  projectId: string;
  hash: string | null;
}

export function CommitDetail({ projectId, hash }: Props) {
  const { data, isLoading, error } = useGitCommit(projectId, hash);
  const [activePath, setActivePath] = useState<string | null>(null);

  // hash가 바뀌면 첫 파일 자동 선택
  useEffect(() => {
    setActivePath(null);
  }, [hash]);

  if (!hash) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-foreground-dim)]">
        커밋을 선택하세요.
      </div>
    );
  }
  if (isLoading) {
    return <div className="p-4 text-xs text-[var(--color-foreground-muted)]">…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-4 text-xs text-[var(--color-danger)]">
        {(error as Error | undefined)?.message ?? "커밋 정보를 불러올 수 없습니다"}
      </div>
    );
  }

  const selectedPath = activePath ?? data.files[0]?.path ?? null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 커밋 메타 헤더 */}
      <div className="p-3 border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-foreground-dim)] font-mono">
          <span>{data.hash.slice(0, 10)}</span>
          <span>·</span>
          <span>{data.author}</span>
          <span>·</span>
          <span>{new Date(data.authoredAt).toLocaleString()}</span>
        </div>
        <div className="mt-2 text-sm whitespace-pre-wrap break-words">
          {data.message}
        </div>
      </div>

      {/* 상단: 파일 리스트 / 하단: diff — 수직 분할 */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="vertical" autoSaveId="cockpit-git-commit-detail">
          <Panel defaultSize={28} minSize={15}>
            <div className="h-full overflow-y-auto">
              {data.files.length === 0 ? (
                <div className="p-3 text-xs text-[var(--color-foreground-dim)]">
                  변경 파일 없음
                </div>
              ) : (
                <div className="flex flex-col p-1">
                  {data.files.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => setActivePath(f.path)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left",
                        "hover:bg-[var(--color-surface-hover)]",
                        selectedPath === f.path &&
                          "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
                      )}
                    >
                      <FileText size={11} className="flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{f.path}</span>
                      {f.additions > 0 && (
                        <span className="text-[10px] text-[var(--color-success)]">
                          +{f.additions}
                        </span>
                      )}
                      {f.deletions > 0 && (
                        <span className="text-[10px] text-[var(--color-danger)]">
                          −{f.deletions}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Panel>
          <PanelResizeHandle className="h-[3px] bg-[var(--color-border)] hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)] transition-colors" />
          <Panel defaultSize={72} minSize={30}>
            <div className="h-full overflow-auto">
              {selectedPath ? (
                <DiffViewer
                  projectId={projectId}
                  commit={data.hash}
                  path={selectedPath}
                />
              ) : (
                <div className="p-6 text-xs text-[var(--color-foreground-dim)]">
                  파일을 선택하세요
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
