"use client";

import { useMemo, useRef, useState } from "react";
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
  /** 외부에서 open 상태 제어 (단축키 등) — 미지정 시 내부 state 자체 사용 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProjectPathPicker({
  trigger,
  onSelect,
  defaultLabel,
  defaultDescription,
  align = "start",
  side = "bottom",
  open: controlledOpen,
  onOpenChange,
}: ProjectPathPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
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

  // 키보드 네비: 검색 input ↔ 항목 버튼들 사이 ↑↓ 이동, Enter로 선택
  const listRef = useRef<HTMLDivElement>(null);
  const focusItemAt = (idx: number) => {
    if (!listRef.current) return;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>(
        "button[data-picker-item]",
      ),
    );
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    items[clamped]?.focus();
  };
  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!listRef.current) return;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>(
        "button[data-picker-item]",
      ),
    );
    const currentIdx = items.indexOf(e.currentTarget);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItemAt(currentIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentIdx === 0) {
        // 맨 위 → 검색 input 으로
        const input =
          listRef.current.parentElement?.querySelector<HTMLInputElement>(
            "input[data-picker-search]",
          );
        input?.focus();
      } else {
        focusItemAt(currentIdx - 1);
      }
    }
  };
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItemAt(0);
    } else if (e.key === "Enter") {
      // Enter로 첫 항목 선택 (빠른 검색+실행)
      if (!listRef.current) return;
      const first = listRef.current.querySelector<HTMLButtonElement>(
        "button[data-picker-item]",
      );
      first?.click();
    }
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
              data-picker-search
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="프로젝트 검색… (↓로 목록 이동, Enter로 첫 항목)"
              className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)] focus:outline-none"
            />
          </div>

          <div ref={listRef} className="overflow-y-auto flex-1 py-1">
            {/* 기본 옵션 */}
            <button
              data-picker-item
              onClick={() => finish(null)}
              onKeyDown={handleItemKeyDown}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] focus:outline-none"
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
                  <ProjectBranch
                    key={p.id}
                    project={p}
                    onSelect={finish}
                    onItemKeyDown={handleItemKeyDown}
                  />
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
  onItemKeyDown,
}: {
  project: Project;
  onSelect: (cwd: string) => void;
  onItemKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
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
          tabIndex={-1}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          data-picker-item
          onClick={() => onSelect(project.path)}
          onKeyDown={onItemKeyDown}
          className="flex-1 flex items-center gap-2 min-w-0 text-left py-0.5 focus:bg-[var(--color-surface-hover)] focus:outline-none rounded"
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
          onItemKeyDown={onItemKeyDown}
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
  onItemKeyDown,
}: {
  projectId: string;
  subPath: string | undefined;
  level: number;
  onSelect: (cwd: string) => void;
  onItemKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
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
          onItemKeyDown={onItemKeyDown}
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
  onItemKeyDown,
}: {
  node: TreeNode;
  projectId: string;
  level: number;
  onSelect: (cwd: string) => void;
  onItemKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
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
          tabIndex={-1}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          data-picker-item
          onClick={() => onSelect(node.absolutePath)}
          onKeyDown={onItemKeyDown}
          className="flex-1 flex items-center gap-2 min-w-0 text-left py-1 focus:bg-[var(--color-surface-hover)] focus:outline-none rounded"
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
          onItemKeyDown={onItemKeyDown}
        />
      )}
    </div>
  );
}
