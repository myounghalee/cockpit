"use client";

import { useRef, useState } from "react";
import { useTerminalStore, flattenPanes } from "@/store/terminal-store";
import { useActiveProjectStore } from "@/store/active-project-store";
import { useNewTabPickerStore } from "@/store/new-tab-picker-store";
import { useProjects } from "@/hooks/use-projects";
import {
  Plus,
  X,
  Globe,
  Terminal as TerminalIcon,
  FileText,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectPathPicker } from "@/components/projects/project-path-picker";

const IS_MAC =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0;
const TAB_MOD = IS_MAC ? "⌘" : "Alt";

export function TerminalTabs() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const setActive = useTerminalStore((s) => s.setActiveTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const createTab = useTerminalStore((s) => s.createTab);
  const createBrowserTab = useTerminalStore((s) => s.createBrowserTab);
  const createFileTab = useTerminalStore((s) => s.createFileTab);
  const duplicateTab = useTerminalStore((s) => s.duplicateTab);
  const renameTab = useTerminalStore((s) => s.renameTab);
  const reorderTabs = useTerminalStore((s) => s.reorderTabs);
  const paneStatuses = useTerminalStore((s) => s.paneStatuses);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const activeId = useActiveProjectStore((s) => s.activeProjectId);
  const { data: projectsData } = useProjects();
  const activeProject = projectsData?.projects.find((p) => p.id === activeId);

  // ⌘T / ⌘⇧T / + 버튼이 공유하는 picker open 상태
  const pickerOpen = useNewTabPickerStore((s) => s.open);
  const setPickerOpen = useNewTabPickerStore((s) => s.setOpen);
  const pickerMode = useNewTabPickerStore((s) => s.mode);
  const splitRightmost = useTerminalStore((s) => s.splitRightmostInActiveTab);

  const handlePickerSelect = (cwd: string | null) => {
    if (pickerMode === "split") {
      // ⌘⇧T — 활성 탭의 오른쪽에 split. cwd 미지정 시 store 내부에서 활성 프로젝트 path 사용.
      void splitRightmost(cwd ?? undefined);
      return;
    }
    // ⌘T / + 버튼 — 새 탭
    if (cwd) void createTab({ cwd });
    else void createTab();
  };

  // 탭의 "주목 필요" 상태 — 다음 중 하나일 때 깜빡임:
  //   (a) 어떤 pane 이 awaitingInput 상태 (Claude y/n 대기 등)
  //   (b) 어떤 pane 이 최근 busy→idle 전환 (작업 완료 알림)
  // 단순 busy (출력 활발하게 나오는 중) 는 깜빡이지 않음.
  // completedAt 은 setActiveTab 에서 리셋되므로 "탭 보면 사라짐".
  const tabRunState = (tab: (typeof tabs)[number]) => {
    if (tab.type === "browser" || tab.type === "file") {
      return {
        attention: false,
        reason: null as "awaiting" | "completed" | null,
        command: null as string | null,
      };
    }
    const panes = flattenPanes(tab.root);
    for (const p of panes) {
      const st = paneStatuses[p.id];
      if (!st) continue;
      if (st.awaitingInput) {
        return { attention: true, reason: "awaiting", command: st.command };
      }
    }
    for (const p of panes) {
      const st = paneStatuses[p.id];
      if (!st) continue;
      // busy → idle 전환 후 아직 dismiss 안 된 탭
      if (!st.busy && st.completedAt !== null) {
        return { attention: true, reason: "completed", command: st.command };
      }
    }
    return { attention: false, reason: null, command: null };
  };

  return (
    <div className="flex items-center h-9 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-1 overflow-x-auto flex-shrink-0">
      {tabs.map((tab, idx) => {
        const runState = tabRunState(tab);
        return (
        <div
          key={tab.id}
          draggable
          onDragStart={(e) => {
            setDragIndex(idx);
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", tab.id);
            } catch {
              // ignore
            }
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOverIndex !== idx) setDragOverIndex(idx);
          }}
          onDragLeave={() => {
            if (dragOverIndex === idx) setDragOverIndex(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null && dragIndex !== idx) {
              reorderTabs(dragIndex, idx);
            }
            setDragIndex(null);
            setDragOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setDragOverIndex(null);
          }}
          onClick={() => setActive(tab.id)}
          className={cn(
            "group flex items-center gap-2 h-full px-3 text-sm cursor-pointer border-r border-[var(--color-border)]",
            "hover:bg-[var(--color-surface-hover)]",
            tab.id === activeTabId
              ? "bg-[var(--color-background)] text-[var(--color-foreground)] border-b-2 border-b-[var(--color-accent)]"
              : "text-[var(--color-foreground-muted)]",
            // 주목 필요한 비활성 탭 — 이름 색도 강조 (응답 대기 또는 방금 완료)
            runState.attention &&
              tab.id !== activeTabId &&
              (runState.reason === "awaiting"
                ? "text-[var(--color-accent)]/90"
                : "text-[var(--color-success)]/90"),
            dragIndex === idx && "opacity-40",
            dragOverIndex === idx &&
              dragIndex !== idx &&
              "border-l-2 border-l-[var(--color-accent)]",
          )}
        >
          {tab.type === "browser" ? (
            <Globe size={12} className="flex-shrink-0 opacity-70" />
          ) : tab.type === "file" ? (
            <FileText size={12} className="flex-shrink-0 opacity-70" />
          ) : runState.attention ? (
            // 주목 필요 (응답 대기 또는 방금 완료) — 깜빡이는 도트
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0 mx-[3px] animate-cockpit-blink",
                runState.reason === "awaiting"
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-success)]",
              )}
              title={
                runState.reason === "awaiting"
                  ? runState.command
                    ? `응답 대기 중: ${runState.command}`
                    : "응답 대기 중"
                  : runState.command
                    ? `방금 완료: ${runState.command}`
                    : "방금 완료"
              }
            />
          ) : (
            <TerminalIcon size={12} className="flex-shrink-0 opacity-70" />
          )}
          {editingTabId === tab.id ? (
            <TabNameInput
              defaultValue={tab.name}
              onDone={(name) => {
                if (name.trim()) renameTab(tab.id, name.trim());
                setEditingTabId(null);
              }}
            />
          ) : (
            <span
              className="truncate max-w-[160px]"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTabId(tab.id);
              }}
              title={
                idx < 9
                  ? `${tab.name} (${TAB_MOD}+${idx + 1}) · 더블클릭으로 이름 변경`
                  : "더블클릭으로 이름 변경"
              }
            >
              {tab.name}
            </span>
          )}
          {idx < 9 && (
            <kbd className="text-[10px] text-[var(--color-foreground-dim)] font-mono opacity-60 group-hover:opacity-100">
              {TAB_MOD}
              {idx + 1}
            </kbd>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void duplicateTab(tab.id);
            }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-hover)] transition-opacity"
            aria-label="탭 복제"
            title="탭 복제"
          >
            <Copy size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)] transition-opacity"
            aria-label="탭 닫기"
          >
            <X size={12} />
          </button>
        </div>
        );
      })}
      <ProjectPathPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handlePickerSelect}
        defaultLabel="기본 (활성 프로젝트)"
        defaultDescription={
          activeProject
            ? `${activeProject.name} — ${activeProject.path}`
            : undefined
        }
        align="start"
        side="bottom"
        trigger={
          <button
            className="flex items-center justify-center w-8 h-full text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
            title={`새 터미널 (${TAB_MOD}T — 프로젝트 선택)`}
            aria-label="새 터미널"
          >
            <Plus size={16} />
          </button>
        }
      />
      <button
        onClick={() => createBrowserTab()}
        className="flex items-center justify-center w-8 h-full text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
        title="새 브라우저 탭"
        aria-label="새 브라우저 탭"
      >
        <Globe size={14} />
      </button>
      <button
        onClick={() => createFileTab()}
        className="flex items-center justify-center w-8 h-full text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
        title="새 파일 뷰어 탭"
        aria-label="새 파일 뷰어 탭"
      >
        <FileText size={14} />
      </button>
    </div>
  );
}

/** 인라인 탭 이름 편집 입력 */
function TabNameInput({
  defaultValue,
  onDone,
}: {
  defaultValue: string;
  onDone: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={inputRef}
      autoFocus
      defaultValue={defaultValue}
      className="w-24 px-1 py-0 text-sm bg-[var(--color-background)] border border-[var(--color-accent)] rounded outline-none text-[var(--color-foreground)]"
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(e.currentTarget.value);
        if (e.key === "Escape") onDone(defaultValue);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
