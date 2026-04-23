"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface McpServer {
  name: string;
  command: string;
  args: string[];
  status?: "connected" | "disconnected" | "needs_auth" | "unknown";
  statusDetail?: string;
}

const STATUS_META: Record<
  NonNullable<McpServer["status"]>,
  { label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  connected: { label: "연결됨", Icon: CheckCircle2, color: "text-green-500" },
  disconnected: { label: "실패", Icon: XCircle, color: "text-red-500" },
  needs_auth: { label: "인증 필요", Icon: AlertCircle, color: "text-amber-500" },
  unknown: { label: "알 수 없음", Icon: HelpCircle, color: "text-[var(--color-foreground-dim)]" },
};

export function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/mcp");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { servers: McpServer[] };
      setServers(json.servers ?? []);
    } catch (err) {
      console.warn("[mcp-tab] 로드 실패:", err);
      setError((err as Error).message);
      setServers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs text-[var(--color-foreground-dim)]">
          {servers.length} MCP 서버 ·{" "}
          <code className="font-mono">claude mcp list</code> 기준
        </span>
        <div className="flex-1" />
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-sm text-red-500">
            MCP 목록 조회 실패: {error}
          </div>
        )}
        {servers.length === 0 && !loading && !error && (
          <div className="p-8 text-center text-sm text-[var(--color-foreground-dim)]">
            MCP 서버가 등록돼 있지 않아요.
            <br />
            <code className="font-mono text-xs">claude mcp add</code> 로 등록
            가능합니다.
          </div>
        )}
        <ul className="divide-y divide-[var(--color-border)]">
          {servers.map((s) => {
            const meta = STATUS_META[s.status ?? "unknown"];
            const { Icon } = meta;
            return (
              <li key={s.name} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className={meta.color} />
                      <span className="font-medium text-sm">{s.name}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", meta.color, "bg-current/10")}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--color-foreground-dim)] break-all">
                      {s.command}
                      {s.args.length > 0 && " " + s.args.join(" ")}
                    </div>
                    {s.statusDetail && s.statusDetail !== meta.label && (
                      <div className="text-[11px] text-[var(--color-foreground-dim)] mt-0.5">
                        {s.statusDetail}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
