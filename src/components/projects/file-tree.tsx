"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File as FileIcon,
  Terminal as TerminalIcon,
  ExternalLink,
} from "lucide-react";
import { useProjectTree } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";
import type { TreeNode } from "@/types/project";

export interface SelectedFile {
  relPath: string;
  absolutePath: string;
  name: string;
}

interface FileTreeProps {
  projectId: string;
  /** 외부에서 선택 상태 제어 (인라인 뷰어 연동) */
  selectedRelPath?: string | null;
  onSelectFile?: (file: SelectedFile) => void;
}

export function FileTree({
  projectId,
  selectedRelPath,
  onSelectFile,
}: FileTreeProps) {
  return (
    <div className="h-full overflow-y-auto p-2">
      <TreeLevel
        projectId={projectId}
        subPath={undefined}
        level={0}
        selectedRelPath={selectedRelPath ?? null}
        onOpenFile={onSelectFile}
      />
    </div>
  );
}

function TreeLevel({
  projectId,
  subPath,
  level,
  selectedRelPath,
  onOpenFile,
}: {
  projectId: string;
  subPath: string | undefined;
  level: number;
  selectedRelPath: string | null;
  onOpenFile?: (v: SelectedFile) => void;
}) {
  const { data, isLoading, error } = useProjectTree(projectId, subPath, 1);

  if (isLoading && level === 0) {
    return (
      <div className="px-2 py-1 text-xs text-[var(--color-foreground-muted)]">
        …
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-2 py-1 text-xs text-[var(--color-danger)]">
        {(error as Error).message}
      </div>
    );
  }
  if (!data) return null;
  if (data.nodes.length === 0 && level === 0) {
    return (
      <div className="px-2 py-1 text-xs text-[var(--color-foreground-dim)]">
        비어 있음
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {data.nodes.map((node) => (
        <TreeNodeView
          key={node.path || node.name}
          node={node}
          projectId={projectId}
          level={level}
          selectedRelPath={selectedRelPath}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}

async function openInOS(absolutePath: string) {
  await fetch("/api/system/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: absolutePath }),
  });
}

function TreeNodeView({
  node,
  projectId,
  level,
  selectedRelPath,
  onOpenFile,
}: {
  node: TreeNode;
  projectId: string;
  level: number;
  selectedRelPath: string | null;
  onOpenFile?: (v: SelectedFile) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const isDir = node.type === "directory";
  const isSelected = !isDir && selectedRelPath === node.path;

  const handleRowClick = () => {
    if (isDir) {
      setExpanded((v) => !v);
    } else if (onOpenFile) {
      onOpenFile({
        relPath: node.path,
        absolutePath: node.absolutePath,
        name: node.name,
      });
    }
  };

  const openTerminalHere = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(
      `/terminal?newTabCwd=${encodeURIComponent(node.absolutePath)}`,
    );
  };

  const revealHere = (e: React.MouseEvent) => {
    e.stopPropagation();
    void openInOS(node.absolutePath);
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded px-1 py-1 text-sm cursor-default",
          isSelected
            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            : "hover:bg-[var(--color-surface-hover)]",
        )}
        style={{ paddingLeft: `${level * 14 + 4}px` }}
        onClick={handleRowClick}
      >
        <span className="w-4 flex-shrink-0 text-[var(--color-foreground-dim)]">
          {isDir ? (
            expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : null}
        </span>
        <span className="w-4 flex-shrink-0 text-[var(--color-foreground-muted)]">
          {isDir ? (
            expanded ? (
              <FolderOpen size={14} />
            ) : (
              <Folder size={14} />
            )
          ) : (
            <FileIcon size={14} />
          )}
        </span>
        <span
          className={cn(
            "flex-1 min-w-0 truncate",
            isDir
              ? "text-[var(--color-foreground)]"
              : "text-[var(--color-foreground-muted)]",
          )}
        >
          {node.name}
        </span>
        {typeof node.size === "number" && !isDir && (
          <span className="text-[10px] text-[var(--color-foreground-dim)]">
            {formatSize(node.size)}
          </span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isDir && (
            <button
              onClick={openTerminalHere}
              className="p-0.5 rounded hover:bg-[var(--color-background)] text-[var(--color-foreground-dim)]"
              aria-label="여기서 터미널 열기"
              title="여기서 터미널 열기"
            >
              <TerminalIcon size={11} />
            </button>
          )}
          <button
            onClick={revealHere}
            className="p-0.5 rounded hover:bg-[var(--color-background)] text-[var(--color-foreground-dim)]"
            aria-label={isDir ? "Finder에서 열기" : "OS 기본 앱으로 열기"}
            title={isDir ? "Finder에서 열기" : "OS 기본 앱으로 열기"}
          >
            <ExternalLink size={11} />
          </button>
        </div>
      </div>
      {isDir && expanded && node.hasChildren && (
        <TreeLevel
          projectId={projectId}
          subPath={node.path}
          level={level + 1}
          selectedRelPath={selectedRelPath}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}
