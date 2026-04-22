"use client";

import { useEffect, useRef } from "react";
import { useTerminalStore } from "@/store/terminal-store";
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        void createTab();
      } else if ((e.key === "w" || e.key === "W") && activeTabId) {
        e.preventDefault();
        void closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, createTab, closeTab]);

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
