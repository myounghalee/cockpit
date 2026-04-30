"use client";

import { useRef, useState } from "react";
import { useTerminalStore, flattenPanes } from "@/store/terminal-store";
import { useNewTabPickerStore } from "@/store/new-tab-picker-store";
import {
  Plus,
  X,
  Globe,
  Terminal as TerminalIcon,
  FileText,
  Copy,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NewTabMenu } from "./new-tab-menu";

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
  const createMemoTab = useTerminalStore((s) => s.createMemoTab);
  const duplicateTab = useTerminalStore((s) => s.duplicateTab);
  const renameTab = useTerminalStore((s) => s.renameTab);
  const reorderTabs = useTerminalStore((s) => s.reorderTabs);
  const paneStatuses = useTerminalStore((s) => s.paneStatuses);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ⌘T / ⌘⇧T / + 버튼이 공유하는 picker open 상태
  const pickerOpen = useNewTabPickerStore((s) => s.open);
  const setPickerOpen = useNewTabPickerStore((s) => s.setOpen);
  const pickerMode = useNewTabPickerStore((s) => s.mode);
  const splitRightmost = useTerminalStore((s) => s.splitRightmostInActiveTab);

  // 터미널 선택 — cwd=null 이면 "홈" (~ 으로 서버에서 확장)
  const handleOpenTerminal = (cwd: string | null) => {
    const targetCwd = cwd ?? "~";
    if (pickerMode === "split") {
      void splitRightmost(targetCwd);
      return;
    }
    void createTab({ cwd: targetCwd });
  };
  const handleOpenBrowser = (url: string) => {
    if (pickerMode === "split") return; // split 모드에선 터미널만
    createBrowserTab(url);
  };
  const handleOpenFile = (filePath: string) => {
    if (pickerMode === "split") return;
    createFileTab(filePath || undefined);
  };
  const handleOpenMemo = (memo: { id: string; title: string }) => {
    if (pickerMode === "split") return;
    createMemoTab(memo.id, memo.title);
  };

  // 탭의 "주목 알림" 상태 — 다음 중 하나가 true && acknowledged=false 면 깜빡임:
  //   (a) 방금 busy→idle 전환 (completedAt 존재 && !busy)   "명령 완료"
  //   (b) awaitingInput 상태 (busy && 서버가 입력 대기 감지) "Claude 응답 대기"
  //   (c) 최근 OSC 9/99/777 알림 수신 (lastNotification 있음)  "에이전트 알림"
  // acknowledged=true 면 깜빡임 중지 (탭 클릭 시 자동 true).
  // 같은 awaitingInput 상태가 계속 와도 재트리거 안 함 (justStartedAwaiting 에서만 리셋).
  const tabRunState = (tab: (typeof tabs)[number]) => {
    if (tab.type === "browser" || tab.type === "file" || tab.type === "memo") {
      return {
        attention: false,
        command: null as string | null,
        notificationText: null as string | null,
      };
    }
    const panes = flattenPanes(tab.root);
    for (const p of panes) {
      const st = paneStatuses[p.id];
      if (!st || st.acknowledged) continue;
      // (c) OSC 알림 — 가장 명확한 신호 (에이전트가 명시적으로 emit)
      if (st.lastNotification) {
        const text =
          [st.lastNotification.title, st.lastNotification.body]
            .filter(Boolean)
            .join(" — ") || null;
        return { attention: true, command: st.command, notificationText: text };
      }
      // (b) 응답 대기
      if (st.busy && st.awaitingInput) {
        return { attention: true, command: st.command, notificationText: null };
      }
      // (a) 방금 완료
      if (!st.busy && st.completedAt !== null) {
        return { attention: true, command: st.command, notificationText: null };
      }
    }
    return { attention: false, command: null, notificationText: null };
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
            // 완료 알림 있는 비활성 탭 — 이름도 success 색으로 강조
            runState.attention &&
              tab.id !== activeTabId &&
              "text-[var(--color-success)]/90",
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
          ) : tab.type === "memo" ? (
            <StickyNote size={12} className="flex-shrink-0 opacity-70" />
          ) : runState.attention ? (
            // 알림/완료 — 탭을 보면 acknowledged=true 로 바뀌어 깜빡임 중지.
            // OSC 알림이면 accent(파랑), 그 외(완료/대기)는 success(초록).
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0 mx-[3px] animate-cockpit-blink",
                runState.notificationText
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-success)]",
              )}
              title={
                runState.notificationText
                  ? `알림: ${runState.notificationText}`
                  : runState.command
                    ? `완료: ${runState.command}`
                    : "작업 완료"
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
      <NewTabMenu
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        splitOnly={pickerMode === "split"}
        onOpenTerminal={handleOpenTerminal}
        onOpenBrowser={handleOpenBrowser}
        onOpenFile={handleOpenFile}
        onOpenMemo={handleOpenMemo}
        trigger={
          <button
            className="flex items-center justify-center w-8 h-full text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
            title={`새 탭 (${TAB_MOD}T — 터미널 / 파일 / 메모)`}
            aria-label="새 탭"
          >
            <Plus size={16} />
          </button>
        }
      />
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
