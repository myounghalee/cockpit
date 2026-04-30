"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Star,
  Search,
  Home,
  Globe,
  FileText,
  StickyNote,
  Terminal as TerminalIcon,
  Pin,
  Clock,
} from "lucide-react";
import { useProjects, useProjectTree } from "@/hooks/use-projects";
import { useTerminalStore } from "@/store/terminal-store";
import { cn } from "@/lib/utils";
import type { Project, TreeNode } from "@/types/project";

type Mode = "terminal" | "file" | "memo";

interface MemoItem {
  id: string;
  title: string;
  tags: string;
  projectName: string | null;
  pinnedAt: string | null;
  updatedAt: string;
}

interface NewTabMenuProps {
  trigger: React.ReactNode;
  /** 외부에서 open 제어 (단축키 공유용) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** split 모드일 땐 터미널 탭만 노출 */
  splitOnly?: boolean;
  /**
   * 터미널 모드에서 검색이 비어 있을 때 최상단에 보여줄 기본 항목.
   * - 새 탭 컨텍스트(상단 + 버튼) → "홈" (cwd=null → ~)
   * - 패인 분할 컨텍스트 → "현재 패널" (caller 가 cwd 전달)
   */
  defaultLabel?: string; // 기본 "홈"

  /** 핸들러들 — caller 가 mode 별로 호출됨 */
  onOpenTerminal: (cwd: string | null) => void; // null=defaultLabel 항목 선택
  onOpenBrowser: (url: string) => void;
  onOpenFile: (filePath: string) => void;
  onOpenMemo: (memo: { id: string; title: string }) => void;
}

/** URL 으로 보이는지 (단순한 휴리스틱) */
function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(t)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(t)) return true;
  // foo.com / foo.com/path — 공백 없고 점 포함하고 도메인스러우면
  if (/\s/.test(t)) return false;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(t)) return true;
  return false;
}

function looksLikeFilePath(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // 절대 경로 또는 ~/...
  return t.startsWith("/") || t.startsWith("~/") || t === "~";
}

function normalizeUrl(input: string): string {
  const t = input.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return "https://" + t;
}

export function NewTabMenu({
  trigger,
  open: controlledOpen,
  onOpenChange,
  splitOnly = false,
  defaultLabel = "홈",
  onOpenTerminal,
  onOpenBrowser,
  onOpenFile,
  onOpenMemo,
}: NewTabMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [mode, setMode] = useState<Mode>("terminal");
  const [query, setQuery] = useState("");

  // open 될 때마다 초기화
  useEffect(() => {
    if (open) {
      setMode("terminal");
      setQuery("");
    }
  }, [open]);

  // ── 데이터 ──────────────────────────────────────────────
  const { data: projectsData } = useProjects();
  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = projectsData?.projects ?? [];
    const filtered = q
      ? items.filter((p) => p.name.toLowerCase().includes(q))
      : items;
    return filtered.slice().sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [projectsData, query]);

  const recentFiles = useTerminalStore((s) => s.recentFiles);
  const recentUrls = useTerminalStore((s) => s.recentUrls);

  const filteredRecentFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentFiles;
    return recentFiles.filter((p) => p.toLowerCase().includes(q));
  }, [recentFiles, query]);

  // 메모는 메뉴를 열거나 메모 모드 진입 시에만 fetch
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [memosLoaded, setMemosLoaded] = useState(false);
  useEffect(() => {
    if (!open || mode !== "memo" || memosLoaded) return;
    let cancelled = false;
    fetch("/api/memos")
      .then((r) => r.json())
      .then((data: { memos: MemoItem[] }) => {
        if (!cancelled) {
          setMemos(data.memos ?? []);
          setMemosLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMemosLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, memosLoaded]);

  const filteredMemos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return memos;
    return memos.filter((m) =>
      `${m.title} ${m.tags} ${m.projectName ?? ""}`.toLowerCase().includes(q),
    );
  }, [memos, query]);

  // ── 액션 ──────────────────────────────────────────────
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const finishTerminal = (cwd: string | null) => {
    onOpenTerminal(cwd);
    close();
  };
  const finishBrowser = (url: string) => {
    onOpenBrowser(normalizeUrl(url));
    close();
  };
  const finishFile = (filePath: string) => {
    onOpenFile(filePath.trim());
    close();
  };
  const finishMemo = (m: MemoItem) => {
    onOpenMemo({ id: m.id, title: m.title || "메모" });
    close();
  };

  // ── 키보드 네비게이션 ─────────────────────────────────
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
      // Enter — 첫 항목 클릭
      if (!listRef.current) return;
      const first = listRef.current.querySelector<HTMLButtonElement>(
        "button[data-picker-item]",
      );
      first?.click();
    } else if (e.key === "Tab") {
      // Tab — mode 순환 (split 모드일 땐 비활성)
      if (splitOnly) return;
      e.preventDefault();
      const order: Mode[] = ["terminal", "file", "memo"];
      const cur = order.indexOf(mode);
      const next = order[(cur + (e.shiftKey ? -1 + order.length : 1)) % order.length];
      setMode(next);
    }
  };

  // ── 검색 자동 감지 ──────────────────────────────────
  const trimmed = query.trim();
  const isUrl = looksLikeUrl(trimmed);
  const isPath = !isUrl && looksLikeFilePath(trimmed);

  // 자동 감지된 입력은 mode 와 무관하게 우선 노출
  const showAutoDetect = !!trimmed && (isUrl || isPath);

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={4}
          className="z-50 w-[360px] max-h-[460px] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0 shadow-xl flex flex-col"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* mode 탭 */}
          {!splitOnly && (
            <div className="flex items-center gap-0 border-b border-[var(--color-border)] px-1 pt-1">
              <ModeTab
                active={mode === "terminal"}
                icon={<TerminalIcon size={11} />}
                label="터미널"
                onClick={() => setMode("terminal")}
              />
              <ModeTab
                active={mode === "file"}
                icon={<FileText size={11} />}
                label="파일"
                onClick={() => setMode("file")}
              />
              <ModeTab
                active={mode === "memo"}
                icon={<StickyNote size={11} />}
                label="메모"
                onClick={() => setMode("memo")}
              />
              <span className="ml-auto text-[10px] text-[var(--color-foreground-dim)] pr-2">
                Tab 으로 전환
              </span>
            </div>
          )}

          {/* 검색 */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-2">
            <Search size={12} className="text-[var(--color-foreground-dim)]" />
            <input
              autoFocus
              data-picker-search
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={
                mode === "terminal"
                  ? "프로젝트 검색 / URL / 경로… (Enter 로 첫 항목)"
                  : mode === "file"
                    ? "파일 경로 또는 최근 파일… (~ /절대경로)"
                    : "메모 검색…"
              }
              className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)] focus:outline-none"
            />
          </div>

          <div ref={listRef} className="overflow-y-auto flex-1 py-1">
            {/* 자동 감지: URL or 파일 경로 — mode 와 무관하게 최상단에 노출 */}
            {showAutoDetect && isUrl && (
              <PickerItem
                icon={<Globe size={13} className="text-[var(--color-accent)]" />}
                label={`${trimmed} 브라우저로 열기`}
                onSelect={() => finishBrowser(trimmed)}
                onKeyDown={handleItemKeyDown}
              />
            )}
            {showAutoDetect && isPath && (
              <PickerItem
                icon={<FileText size={13} className="text-[var(--color-accent)]" />}
                label={`${trimmed} 파일 뷰어로 열기`}
                onSelect={() => finishFile(trimmed)}
                onKeyDown={handleItemKeyDown}
              />
            )}
            {showAutoDetect && (
              <div className="h-px bg-[var(--color-border)] my-1" />
            )}

            {/* === 터미널 모드 === */}
            {mode === "terminal" && (
              <>
                {/* 검색이 비어 있을 때만 기본 항목(홈 또는 caller 지정 라벨) 노출 — 프로젝트 항목과 동일한 1줄 사이즈 */}
                {!trimmed && (
                  <>
                    <DefaultRow
                      label={defaultLabel}
                      onSelect={() => finishTerminal(null)}
                      onKeyDown={handleItemKeyDown}
                    />
                    <div className="h-px bg-[var(--color-border)] my-1" />
                  </>
                )}

                {!showAutoDetect && (
                  <>
                    {projects.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-[var(--color-foreground-dim)]">
                        {projectsData?.projects.length === 0 ? (
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
                            onSelect={(cwd) => finishTerminal(cwd)}
                            onItemKeyDown={handleItemKeyDown}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* === 파일 모드 === */}
            {mode === "file" && !showAutoDetect && (
              <>
                {!trimmed && (
                  <>
                    <PickerItem
                      icon={
                        <FileText
                          size={13}
                          className="text-[var(--color-accent)]"
                        />
                      }
                      label="빈 파일 뷰어 탭"
                      description="경로 입력해서 열기"
                      onSelect={() => finishFile("")}
                      onKeyDown={handleItemKeyDown}
                    />
                    {recentFiles.length > 0 && (
                      <div className="h-px bg-[var(--color-border)] my-1" />
                    )}
                  </>
                )}

                {filteredRecentFiles.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-[var(--color-foreground-dim)]">
                    {recentFiles.length === 0
                      ? "최근 연 파일이 없습니다."
                      : "일치하는 파일 없음"}
                  </div>
                ) : (
                  <>
                    {!trimmed && (
                      <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-foreground-dim)] flex items-center gap-1">
                        <Clock size={9} /> 최근
                      </div>
                    )}
                    {filteredRecentFiles.map((p) => (
                      <PickerItem
                        key={p}
                        icon={
                          <FileText
                            size={13}
                            className="text-[var(--color-foreground-muted)]"
                          />
                        }
                        label={p.split("/").pop() || p}
                        description={p}
                        onSelect={() => finishFile(p)}
                        onKeyDown={handleItemKeyDown}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* === 메모 모드 === */}
            {mode === "memo" && !showAutoDetect && (
              <>
                {!memosLoaded && (
                  <div className="px-3 py-6 text-center text-xs text-[var(--color-foreground-dim)]">
                    불러오는 중…
                  </div>
                )}
                {memosLoaded && filteredMemos.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-[var(--color-foreground-dim)]">
                    {memos.length === 0
                      ? "메모가 없어요. 메모 페이지에서 먼저 작성하세요."
                      : "검색 결과 없음"}
                  </div>
                )}
                {filteredMemos.map((m) => {
                  const tags = m.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean);
                  const sub =
                    [m.projectName ?? "전역", ...(tags.length ? [tags.join(", ")] : [])].join(
                      " · ",
                    );
                  return (
                    <PickerItem
                      key={m.id}
                      icon={
                        m.pinnedAt ? (
                          <Pin
                            size={11}
                            className="text-[var(--color-accent)]"
                          />
                        ) : (
                          <StickyNote
                            size={12}
                            className="text-[var(--color-foreground-dim)]"
                          />
                        )
                      }
                      label={m.title || "(제목 없음)"}
                      description={sub}
                      onSelect={() => finishMemo(m)}
                      onKeyDown={handleItemKeyDown}
                    />
                  );
                })}
              </>
            )}

            {/* 최근 URL — 터미널/파일 모드에서 검색 비어 있을 때, 작은 hint 로 */}
            {!splitOnly &&
              mode === "terminal" &&
              !trimmed &&
              recentUrls.length > 0 && (
                <>
                  <div className="h-px bg-[var(--color-border)] my-1" />
                  <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-foreground-dim)] flex items-center gap-1">
                    <Clock size={9} /> 최근 URL
                  </div>
                  {recentUrls.slice(0, 3).map((u) => (
                    <PickerItem
                      key={u}
                      icon={
                        <Globe
                          size={12}
                          className="text-[var(--color-foreground-muted)]"
                        />
                      }
                      label={u}
                      onSelect={() => finishBrowser(u)}
                      onKeyDown={handleItemKeyDown}
                    />
                  ))}
                </>
              )}
          </div>
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

/**
 * 터미널 모드의 기본 항목 ("홈" 또는 "현재 패널") — ProjectBranch 와 동일한 컴팩트 1줄 사이즈.
 * 프로젝트 항목의 chevron 자리에는 invisible spacer 를 두어 정렬 맞춤.
 */
function DefaultRow({
  label,
  onSelect,
  onKeyDown,
}: {
  label: string;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="group flex items-center gap-1 px-1 py-1 hover:bg-[var(--color-surface-hover)]">
      {/* chevron spacer — 프로젝트 행의 펼치기 버튼 자리 (p-1 + size 12 = 20px) */}
      <span className="p-1 inline-flex">
        <span className="w-3 h-3" />
      </span>
      <button
        data-picker-item
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className="flex-1 flex items-center gap-2 min-w-0 text-left py-0.5 focus:bg-[var(--color-surface-hover)] focus:outline-none rounded"
      >
        <Home size={12} className="text-[var(--color-accent)] flex-shrink-0" />
        <span className="truncate text-sm">{label}</span>
      </button>
    </div>
  );
}

function ModeTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1 text-xs rounded-t border-b-2 -mb-px",
        active
          ? "border-[var(--color-accent)] text-[var(--color-foreground)]"
          : "border-transparent text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PickerItem({
  icon,
  label,
  description,
  onSelect,
  onKeyDown,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onSelect: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      data-picker-item
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] focus:bg-[var(--color-surface-hover)] focus:outline-none"
    >
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--color-foreground)] truncate">
          {label}
        </div>
        {description && (
          <div className="text-[11px] text-[var(--color-foreground-dim)] truncate font-mono">
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

// ── 프로젝트 트리 (project-path-picker 와 동일한 동작) ──────────────────

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
