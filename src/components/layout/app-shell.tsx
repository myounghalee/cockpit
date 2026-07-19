"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Sidebar } from "./sidebar";
import { UpdateBanner } from "./update-banner";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { useTerminalStore } from "@/store/terminal-store";
import { useQuickMemoStore } from "@/store/quick-memo-store";
import { useTicketCompletionNotifier } from "@/hooks/use-ticket-completion-notifier";
import { NewMemoDialog } from "@/components/memo/new-memo-dialog";

// 터미널 워크스페이스는 AppShell 하위에 항상 마운트되어 있으며,
// /terminal 라우트가 아닐 때 hidden으로만 가려진다.
// 이렇게 하면 다른 페이지로 이동했다가 돌아와도 xterm/WebSocket이 살아있어 출력이 보존된다.
const TerminalWorkspace = dynamic(
  () =>
    import("../terminal/terminal-workspace").then((m) => m.TerminalWorkspace),
  { ssr: false },
);

/** Ctrl+숫자 단축키 매핑 — 메인 메뉴 전환 (Settings는 Cmd/Ctrl+, 로 분리) */
const NAV_SHORTCUTS: Record<string, string> = {
  "1": "/projects",
  "2": "/terminal",
  "3": "/kanban",
  "4": "/git",
  "5": "/memo",
  "6": "/insights",
  "7": "/claude",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const quickMemoOpen = useQuickMemoStore((s) => s.open);
  const openQuickMemo = useQuickMemoStore((s) => s.openDialog);
  const closeQuickMemo = useQuickMemoStore((s) => s.closeDialog);
  const onTerminal = pathname === "/terminal";

  // 전역 티켓 완료 알림 — 모든 페이지에서 동작
  useTicketCompletionNotifier();

  // 단축키:
  //  - Cmd/Ctrl + S       → 사이드바 토글 (어디서나)
  //  - Cmd/Ctrl + Shift+N → 빠른 메모 다이얼로그 (어디서나)
  //  - Cmd/Ctrl + ,       → Settings (macOS Preferences 관례)
  //  - Ctrl     + 1~6     → 메인 메뉴 전환 (Mac/Win 공통, metaKey 아님)
  //  - Cmd      + 1~9     → 현재 터미널 라우트에서 터미널 탭 전환 (Mac)
  //  - Alt      + 1~9     → 동일하게 터미널 탭 전환 (Windows/Linux)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Shift+N — 빠른 메모 (input 안에서도 동작. Ctrl+N 브라우저 기본 충돌 방지 위해 Shift 조합)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        openQuickMemo();
        return;
      }

      // Cmd/Ctrl + , (macOS Preferences 관례) → Settings
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key === ","
      ) {
        e.preventDefault();
        router.push("/settings");
        return;
      }

      // Cmd/Ctrl+S — 사이드바 토글
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // 터미널 라우트: Cmd(Mac) 또는 Alt(Win/Linux) + 1~9 → 탭 전환
      if (
        onTerminal &&
        !e.shiftKey &&
        !e.ctrlKey &&
        (e.metaKey || e.altKey) &&
        /^[1-9]$/.test(e.key)
      ) {
        const idx = Number(e.key) - 1;
        const { tabs, setActiveTab } = useTerminalStore.getState();
        const tab = tabs[idx];
        if (tab) {
          e.preventDefault();
          setActiveTab(tab.id);
        }
        return;
      }

      // Ctrl+1~6 — 메뉴 전환 (Mac에서 Cmd는 터미널 탭용으로 분리됨)
      if (!e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const target = NAV_SHORTCUTS[e.key];
      if (!target) return;
      // input/textarea/contenteditable 안에서는 무시
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      router.push(target);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, toggleSidebar, onTerminal, openQuickMemo]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 relative flex flex-col focus:outline-none focus-visible:outline-none">
        <UpdateBanner />
        {/* 페이지 컨텐츠 — 터미널 라우트일 때는 숨김 */}
        <div
          className={cn(
            "flex-1 min-w-0 min-h-0 flex flex-col",
            onTerminal && "hidden",
          )}
        >
          {children}
        </div>
        {/* 터미널 — 항상 마운트, 터미널 라우트가 아니면 숨김.
            flex 흐름 안에 배치하여 상단 UpdateBanner 를 가리지 않게 함. */}
        <div
          className={cn(
            "flex-1 min-w-0 min-h-0 flex flex-col",
            !onTerminal && "hidden",
          )}
        >
          <TerminalWorkspace />
        </div>
      </main>

      {/* 빠른 메모 다이얼로그 — ⌘⇧N 어디서나 호출 가능 */}
      <NewMemoDialog
        open={quickMemoOpen}
        onOpenChange={(v) => (v ? null : closeQuickMemo())}
      />
    </div>
  );
}
