"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useTerminalStore,
  firstLeafPaneId,
  flattenPanes,
} from "@/store/terminal-store";
import { useNewTabPickerStore } from "@/store/new-tab-picker-store";
import { TerminalTabs } from "./terminal-tabs";
import { TerminalSplit } from "./terminal-split";
import { BrowserPane } from "./browser-pane";
import { FilePane } from "./file-pane";
import { Terminal as TerminalIcon } from "lucide-react";

export function TerminalWorkspace() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const hydrated = useTerminalStore((s) => s.hydrated);
  const createTab = useTerminalStore((s) => s.createTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const syncWithServer = useTerminalStore((s) => s.syncWithServer);
  const splitRightmost = useTerminalStore((s) => s.splitRightmostInActiveTab);
  const openNewTabPicker = useNewTabPickerStore((s) => s.openPicker);
  const router = useRouter();

  // 앱 시작 시: persist 복원 완료 → 서버 pty 목록과 동기화 → 탭 없고 쿼리도 없으면 기본 탭 생성.
  // 1회만 실행.
  const initRef = useRef(false);
  useEffect(() => {
    if (!hydrated || initRef.current) return;
    initRef.current = true;
    void syncWithServer().then(() => {
      const { tabs: current } = useTerminalStore.getState();
      if (current.length > 0) return;
      if (typeof window !== "undefined") {
        const onTerminalRoute = window.location.pathname === "/terminal";
        const hasParam = new URLSearchParams(window.location.search).has(
          "newTabCwd",
        );
        // 터미널 라우트 + newTabCwd 쿼리면 page가 처리하므로 skip.
        if (onTerminalRoute && hasParam) return;
      }
      void createTab();
    });
  }, [hydrated, syncWithServer, createTab]);

  // 전역 단축키
  //  ⌘T        → 프로젝트 선택 picker 열기 (키보드 네비로 선택 후 엔터)
  //  ⌘⇧T       → 활성 탭에 horizontal split + 활성 프로젝트 cwd
  //  ⌘W        → 활성 탭 닫기 (confirm 다이얼로그)
  //  ⌘⇧←/→    → 이전/다음 탭 전환 (wrap around)
  //  Enter     → 터미널 화면에서 xterm 밖 focus 일 때 첫 pane 에 focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ── ⌘⇧←/→ 탭 전환 ──
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        const state = useTerminalStore.getState();
        if (state.tabs.length <= 1) return;
        e.preventDefault();
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        if (idx < 0) return;
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const next =
          (idx + delta + state.tabs.length) % state.tabs.length;
        state.setActiveTab(state.tabs[next].id);
        return;
      }

      // ── ⌘⌥←/→ split 내 pane 포커스 이동 (flat ordering, wrap) ──
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        const state = useTerminalStore.getState();
        const active = state.tabs.find((t) => t.id === state.activeTabId);
        if (!active || active.type === "browser" || active.type === "file")
          return;
        const panes = flattenPanes(active.root);
        if (panes.length <= 1) return;
        e.preventDefault();
        // 현재 focused pane 찾기 — activeElement 부모 체인에서 data-pane-id 조회
        const activeEl =
          typeof document !== "undefined"
            ? (document.activeElement as HTMLElement | null)
            : null;
        const currentPaneEl = activeEl?.closest?.(
          "[data-pane-id]",
        ) as HTMLElement | null;
        const currentId = currentPaneEl?.dataset?.paneId;
        let currentIdx = 0;
        if (currentId) {
          const found = panes.findIndex((p) => p.id === currentId);
          if (found >= 0) currentIdx = found;
        }
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const next = (currentIdx + delta + panes.length) % panes.length;
        window.dispatchEvent(
          new CustomEvent("cockpit-focus-pane", {
            detail: { paneId: panes[next].id },
          }),
        );
        return;
      }

      // ── Enter (mod 없음) → 첫 터미널 pane 에 focus ──
      if (
        e.key === "Enter" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        // xterm/input 안에서 발생한 Enter 는 무시 (그들이 이미 처리)
        const el = e.target as HTMLElement | null;
        if (
          el &&
          (el.closest(".xterm") ||
            el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.isContentEditable)
        ) {
          return;
        }
        // 터미널 화면에 있을 때만 focus 점프
        if (
          typeof window === "undefined" ||
          window.location.pathname !== "/terminal"
        ) {
          return;
        }
        const state = useTerminalStore.getState();
        const active = state.tabs.find((t) => t.id === state.activeTabId);
        if (!active || active.type === "browser" || active.type === "file") return;
        const firstId = firstLeafPaneId(active.root);
        window.dispatchEvent(
          new CustomEvent("cockpit-focus-pane", { detail: { paneId: firstId } }),
        );
        return;
      }

      // ── ⌘T / ⌘⇧T / ⌘W ──
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        if (typeof window !== "undefined" && window.location.pathname !== "/terminal") {
          router.push("/terminal");
        }
        if (e.shiftKey) {
          void splitRightmost();
        } else {
          openNewTabPicker();
        }
      } else if (
        (e.key === "w" || e.key === "W") &&
        activeTabId &&
        !e.shiftKey
      ) {
        e.preventDefault();
        const state = useTerminalStore.getState();
        const tab = state.tabs.find((t) => t.id === activeTabId);
        const name = tab?.name ?? "이 탭";
        // 실수로 닫는 것 방지 — confirm 다이얼로그
        if (!confirm(`"${name}" 탭을 닫을까요?`)) return;
        void closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, createTab, closeTab, splitRightmost, openNewTabPicker, router]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-full min-h-0">
      <TerminalTabs />
      <div className="flex-1 min-h-0 relative">
        {tabs.length === 0 ? (
          <EmptyState />
        ) : (
          // 모든 탭을 mount 상태로 유지 (pty 세션 / iframe 세션 유지용)
          tabs.map((tab) => (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ display: tab.id === activeTabId ? "block" : "none" }}
            >
              {tab.type === "browser" ? (
                <BrowserPane tabId={tab.id} initialUrl={tab.url} />
              ) : tab.type === "file" ? (
                <FilePane tabId={tab.id} initialPath={tab.url} />
              ) : (
                <TerminalSplit node={tab.root} tabId={tab.id} />
              )}
            </div>
          ))
        )}
        {activeTab == null && tabs.length > 0 && <EmptyState />}
      </div>
    </div>
  );
}

function EmptyState() {
  const createTab = useTerminalStore((s) => s.createTab);
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <TerminalIcon size={40} className="mx-auto text-[var(--color-foreground-dim)] mb-3" />
        <p className="text-sm text-[var(--color-foreground-muted)] mb-4">
          터미널이 없습니다.
        </p>
        <button
          onClick={() => void createTab()}
          className="px-4 py-2 text-sm bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-md"
        >
          새 터미널 열기
        </button>
      </div>
    </div>
  );
}
