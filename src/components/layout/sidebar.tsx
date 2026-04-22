"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Terminal as TerminalIcon,
  KanbanSquare,
  GitBranch,
  PanelLeftClose,
  Plane,
  FolderKanban,
  Settings as SettingsIcon,
} from "lucide-react";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { ActiveProjectBadge } from "./active-project-badge";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  shortcut: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/projects", label: "Projects", icon: FolderKanban, shortcut: "1" },
  { href: "/terminal", label: "Terminal", icon: TerminalIcon, shortcut: "2" },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare, shortcut: "3" },
  { href: "/git", label: "Git", icon: GitBranch, shortcut: "4" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, shortcut: "5" },
];

const IS_MAC =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0;
// 메뉴 전환 — Mac은 ⌃ 기호(Control), Win/Linux는 "Ctrl" 텍스트
const MOD_KEY = IS_MAC ? "⌃" : "Ctrl";
// 사이드바 토글(⌘S / Ctrl+S)용 표시
const SIDEBAR_MOD = IS_MAC ? "⌘" : "Ctrl";

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r border-[var(--color-border)] bg-[var(--color-surface)]",
        "transition-[width] duration-150 ease-out",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* 헤더: 로고 + 접기 — 접힌 상태에선 로고 자체가 펼치기 버튼 */}
      <div
        className={cn(
          "flex items-center h-14 border-b border-[var(--color-border)]",
          collapsed ? "justify-center px-0" : "justify-between px-3",
        )}
      >
        {collapsed ? (
          <button
            onClick={toggle}
            className="w-10 h-10 rounded bg-[var(--color-accent)]/20 hover:bg-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)]"
            aria-label={`사이드바 펼치기 (${SIDEBAR_MOD}+S)`}
            title={`사이드바 펼치기 (${SIDEBAR_MOD}+S)`}
          >
            <Plane size={18} />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded bg-[var(--color-accent)]/20 flex items-center justify-center flex-shrink-0">
                <Plane size={18} className="text-[var(--color-accent)]" />
              </div>
              <span className="font-semibold truncate">Cockpit</span>
            </div>
            <button
              onClick={toggle}
              className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] flex-shrink-0"
              aria-label={`사이드바 접기 (${SIDEBAR_MOD}+S)`}
              title={`사이드바 접기 (${SIDEBAR_MOD}+S)`}
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        )}
      </div>

      {/* 내비게이션 */}
      <nav className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]",
                collapsed && "justify-center px-0",
              )}
              title={
                collapsed
                  ? `${item.label} (${
                      IS_MAC
                        ? `${MOD_KEY}${item.shortcut}`
                        : `${MOD_KEY}+${item.shortcut}`
                    })`
                  : undefined
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  <kbd className="text-[10px] text-[var(--color-foreground-dim)] font-mono">
                    {IS_MAC
                      ? `${MOD_KEY}${item.shortcut}`
                      : `${MOD_KEY}+${item.shortcut}`}
                  </kbd>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 활성 프로젝트 배지 */}
      <ActiveProjectBadge collapsed={collapsed} />

      {/* 푸터 */}
      {!collapsed && (
        <div className="p-3 border-t border-[var(--color-border)] text-[10px] text-[var(--color-foreground-dim)]">
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}
        </div>
      )}
    </aside>
  );
}
