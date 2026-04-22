"use client";

import {
  MoreVertical,
  Play,
  RefreshCw,
  Check,
  Pencil,
  Trash2,
  Terminal as TerminalIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteTicket,
  useUpdateTicket,
  useReworkTicket,
} from "@/hooks/use-tickets";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { Ticket } from "@/types/ticket";

interface Props {
  ticket: Ticket;
  projectId: string;
  showProjectBadge?: boolean;
  onEdit: (t: Ticket) => void;
  onOpenRunning?: (t: Ticket) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

export function TicketCard({
  ticket,
  projectId,
  showProjectBadge,
  onEdit,
  onOpenRunning,
  dragHandleProps,
  isDragging,
}: Props) {
  const updateMut = useUpdateTicket(projectId);
  const deleteMut = useDeleteTicket(projectId);
  const reworkMut = useReworkTicket(projectId);
  const qc = useQueryClient();
  const isRunning = ticket.status === "in_progress";

  const runTicket = async () => {
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/run`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
      qc.invalidateQueries({ queryKey: ["tickets"] });
      // 우측 패널 자동 오픈
      onOpenRunning?.(ticket);
    } catch (err) {
      alert(`실행 실패: ${(err as Error).message}`);
    }
  };

  const markDone = () =>
    updateMut.mutate({ id: ticket.id, status: "done" });

  const requestRework = () => {
    const reason = window.prompt("재작업 요청 내용을 입력하세요:", "");
    if (reason === null) return;
    reworkMut.mutate({ id: ticket.id, reason: reason || undefined });
  };

  const remove = () => {
    if (!confirm(`티켓 "${ticket.title}"을 삭제할까요?`)) return;
    deleteMut.mutate(ticket.id);
  };

  return (
    <div
      {...dragHandleProps}
      className={cn(
        "group rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-sm",
        "hover:border-[var(--color-border-strong)]",
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1 mb-1.5 min-h-[18px]">
        {isRunning && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            실행 중
          </span>
        )}
        {showProjectBadge && ticket.projectName && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400 font-mono truncate max-w-[100px]">
            {ticket.projectName}
          </span>
        )}
        {ticket.jiraKey && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] font-mono">
            {ticket.jiraKey}
          </span>
        )}
        {ticket.pdcaStage && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-400 font-medium"
            title="PDCA 사이클 티켓"
          >
            PDCA · {String(ticket.pdcaStage)}
          </span>
        )}
        {ticket.sessionId && (
          <span
            className="px-1 py-0.5 rounded text-[10px] text-[var(--color-foreground-dim)]"
            title="Claude 세션 재사용 가능"
          >
            <TerminalIcon size={10} />
          </span>
        )}
        <div className="flex-1" />
        {ticket.status === "backlog" && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              runTicket();
            }}
            className="p-0.5 rounded text-green-400 hover:bg-green-500/15"
            title={ticket.sessionId ? "이어서 실행" : "실행"}
            aria-label="실행"
          >
            <Play size={12} fill="currentColor" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
              aria-label="메뉴"
            >
              <MoreVertical size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ticket.status !== "done" && (
              <DropdownMenuItem onSelect={runTicket}>
                <Play size={12} /> {ticket.sessionId ? "재개" : "실행"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onEdit(ticket)}>
              <Pencil size={12} /> 편집
            </DropdownMenuItem>
            {ticket.status !== "done" && (
              <DropdownMenuItem onSelect={markDone}>
                <Check size={12} /> 완료로 이동
              </DropdownMenuItem>
            )}
            {ticket.status === "review" && (
              <DropdownMenuItem onSelect={requestRework}>
                <RefreshCw size={12} /> 재작업 요청
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={remove}
              className="text-[var(--color-danger)]"
            >
              <Trash2 size={12} /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="font-medium text-[var(--color-foreground)] truncate cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          // backlog: 편집 dialog, 그 외(in_progress/review/done): 우측 상세 패널
          if (ticket.status !== "backlog" && onOpenRunning) {
            onOpenRunning(ticket);
          } else {
            onEdit(ticket);
          }
        }}
      >
        {ticket.title}
      </div>
      {ticket.description && (
        <div className="mt-1 text-xs text-[var(--color-foreground-muted)] line-clamp-2">
          {ticket.description}
        </div>
      )}
      {ticket.resultSummary && (
        <div className="mt-1 text-xs text-green-400 line-clamp-2">
          ✓ {ticket.resultSummary}
        </div>
      )}
      {ticket.reworkCount > 0 && (
        <div className="mt-2 text-[10px] text-[var(--color-warning)]">
          ↻ 재작업 {ticket.reworkCount}회
        </div>
      )}
    </div>
  );
}
