"use client";

import {
  Edit3,
  FileSearch,
  FileText as FileIcon,
  Globe,
  Search,
  Terminal as TerminalIcon,
  ListChecks,
  Workflow,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export interface TimelineAction {
  id: string;
  ts: string;
  name: string;
  summary: string;
  status: "running" | "done" | "error";
}

interface Props {
  actions: TimelineAction[];
}

function iconFor(name: string) {
  switch (name) {
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return Edit3;
    case "Read":
      return FileIcon;
    case "Glob":
      return FileSearch;
    case "Grep":
      return Search;
    case "Bash":
      return TerminalIcon;
    case "WebFetch":
    case "WebSearch":
      return Globe;
    case "TodoWrite":
      return ListChecks;
    case "Task":
      return Workflow;
    default:
      return Activity;
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ActionTimeline({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="text-[11px] text-[var(--color-foreground-dim)] p-2 text-center">
        아직 실행된 작업이 없습니다.
      </div>
    );
  }

  // 최근 것이 위로
  const items = [...actions].reverse();

  return (
    <ul className="flex flex-col gap-1 max-h-96 overflow-y-auto pr-1">
      {items.map((a) => {
        const Icon = iconFor(a.name);
        const StatusIcon =
          a.status === "running"
            ? Loader2
            : a.status === "error"
              ? XCircle
              : CheckCircle2;
        const statusColor =
          a.status === "running"
            ? "text-blue-400"
            : a.status === "error"
              ? "text-red-400"
              : "text-green-400";

        return (
          <li
            key={a.id}
            className="flex items-start gap-2 text-xs py-1 px-1.5 rounded hover:bg-[var(--color-surface-hover)]"
          >
            <Icon
              size={12}
              className="text-[var(--color-foreground-muted)] shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[var(--color-foreground)]">
                  {a.name}
                </span>
                <StatusIcon
                  size={10}
                  className={`${statusColor} ${
                    a.status === "running" ? "animate-spin" : ""
                  }`}
                />
                <span className="text-[10px] text-[var(--color-foreground-dim)] ml-auto">
                  {formatTime(a.ts)}
                </span>
              </div>
              {a.summary && (
                <div className="text-[10px] text-[var(--color-foreground-muted)] font-mono truncate">
                  {a.summary}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
