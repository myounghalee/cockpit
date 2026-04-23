"use client";

import { useState } from "react";
import { Bot, MessageSquare, Plug, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionsTab } from "@/components/claude/sessions-tab";
import { McpTab } from "@/components/claude/mcp-tab";
import { UsageTab } from "@/components/claude/usage-tab";

type TabKey = "sessions" | "mcp" | "usage";

export default function ClaudePage() {
  const [tab, setTab] = useState<TabKey>("sessions");

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[var(--color-accent)]" />
          <h1 className="text-sm font-semibold">Claude</h1>
        </div>

        <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden ml-2">
          <TabButton
            active={tab === "sessions"}
            onClick={() => setTab("sessions")}
            icon={<MessageSquare size={12} />}
            label="Sessions"
          />
          <TabButton
            active={tab === "mcp"}
            onClick={() => setTab("mcp")}
            icon={<Plug size={12} />}
            label="MCP"
          />
          <TabButton
            active={tab === "usage"}
            onClick={() => setTab("usage")}
            icon={<BarChart3 size={12} />}
            label="Usage"
          />
        </div>
      </header>

      {tab === "sessions" ? (
        <SessionsTab />
      ) : tab === "mcp" ? (
        <McpTab />
      ) : (
        <UsageTab />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-xs px-2.5 h-7",
        active
          ? "bg-[var(--color-accent)] text-white"
          : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
