"use client";

import { useMemo, useState } from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Star,
  Search,
} from "lucide-react";
import { useProjects, useProjectTree } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";
import type { Project, TreeNode } from "@/types/project";

interface ProjectPathPickerProps {
  trigger: React.ReactNode;
  /** cwd=null이면 "기본 옵션" 선택을 의미 */
  onSelect: (cwd: string | null) => void;
  defaultLabel: string;
  defaultDescription?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

export function ProjectPathPicker({
  trigger,
  onSelect,
  defaultLabel,
  defaultDescription,
  align = "start",
  side = "bottom",
}: ProjectPathPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data } = useProjects();

  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = data?.projects ?? [];
    const filtered = q
      ? items.filter((p) => p.name.toLowerCase().includes(q))
      : items;
    // 정렬: 즐겨찾기 먼저, 이후 이름순
    return filtered.slice().sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data, query]);

  const finish = (cwd: string | null) => {
    onSelect(cwd);
    setOpen(false);
    setQuery("");
  };

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={align}
          side={side}
          sideOffset={4}
          className="z-50 w-[340px] max-h-[420px] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0 shadow-xl flex flex-col"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* 검색 */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-2">
            <Search size={12} className="text-[var(--color-foreground-dim)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="프로젝트 검색…"
              className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)] focus:outline-none"
            />
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {/* 기본 옵션 */}
            <button
              onClick={() => finish(null)}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-hover)]"
            >
              <ChevronRight
                size={14}
                className="mt-0.5 text-[var(--color-accent)]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--color-foreground)]">
                  {defaultLabel}
                </div>
                {defaultDescription && (
                  <div className="text-[11px] text-[var(--color-foreground-dim)] truncate">
                    {defaultDescription}
                  </div>
                )}
              </div>
            </button>

            <div className="h-px bg-[var(--color-border)] my-1" />

            {/* 프로젝트 목록 */}
            {projects.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[var(--color-foreground-dim)]">
                {data?.projects.length === 0 ? (
                  <>
                    등록된 프로젝트가 없습니다.
                    <br />
                    Projects 메뉴에서 먼저 등록하세요.
                  </>
                ) : (
                  "일치하는 프로젝트 없음"
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                {projects.map((p) => (
                  <ProjectBranch key={p.id} project={p} onSelect={finish} />
                ))}
              </div>
            )}
          </div>
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

function ProjectBranch({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: (cwd: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="group flex items-center gap-1 px-1 py-1 hover:bg-[var(--color-surface-hover)]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="p-1 rounded text-[var(--color-foreground-dim)]"
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          onClick={() => onSelect(project.path)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left py-0.5"
        >
          {project.isFavorite ? (
            <Star
              size={12}
              fill="currentColor"
              className="text-[var(--color-warning)] flex-shrink-0"
            />
          ) : (
            <Folder
              size={12}
              className="text-[var(--color-foreground-muted)] flex-shrink-0"
            />
          )}
          <span className="truncate text-sm">{project.name}</span>
        </button>
      </div>
      {expanded && (
        <PickerTreeLevel
          projectId={project.id}
          subPath={undefined}
          level={1}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function PickerTreeLevel({
  projectId,
  subPath,
  level,
  onSelect,
}: {
  projectId: string;
  subPath: string | undefined;
  level: number;
  onSelect: (cwd: string) => void;
}) {
  const { data, isLoading, error } = useProjectTree(projectId, subPath, 1);

  if (isLoading) {
    return (
      <div
        className="py-1 text-[10px] text-[var(--color-foreground-dim)]"
        style={{ paddingLeft: `${level * 14 + 4}px` }}
      >
        …
      </div>
    );
  }
  if (error) return null;
  if (!data) return null;

  // 폴더만 (파일 제외)
  const folders = data.nodes.filter((n) => n.type === "directory");
  if (folders.length === 0) {
    return (
      <div
        className="py-1 text-[10px] text-[var(--color-foreground-dim)]"
        style={{ paddingLeft: `${level * 14 + 4}px` }}
      >
        하위 폴더 없음
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {folders.map((n) => (
        <PickerTreeNode
          key={n.path || n.name}
          node={n}
          projectId={projectId}
          level={level}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PickerTreeNode({
  node,
  projectId,
  level,
  onSelect,
}: {
  node: TreeNode;
  projectId: string;
  level: number;
  onSelect: (cwd: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.hasChildren !== false;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 hover:bg-[var(--color-surface-hover)]",
        )}
        style={{ paddingLeft: `${level * 14 + 4}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded((v) => !v);
          }}
          className={cn(
            "p-1 rounded",
            hasChildren
              ? "text-[var(--color-foreground-dim)]"
              : "text-transparent pointer-events-none",
          )}
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          onClick={() => onSelect(node.absolutePath)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left py-1"
        >
          {expanded ? (
            <FolderOpen
              size={12}
              className="text-[var(--color-foreground-muted)] flex-shrink-0"
            />
          ) : (
            <Folder
              size={12}
              className="text-[var(--color-foreground-muted)] flex-shrink-0"
            />
          )}
          <span className="truncate text-xs">{node.name}</span>
        </button>
      </div>
      {expanded && hasChildren && (
        <PickerTreeLevel
          projectId={projectId}
          subPath={node.path}
          level={level + 1}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
