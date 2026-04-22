"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/types/ticket";
import { SortableTicket } from "./sortable-ticket";

interface Props {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
  projectId: string;
  showProjectBadge?: boolean;
  onCreate?: (status: TicketStatus) => void;
  onEdit: (t: Ticket) => void;
  onOpenRunning?: (t: Ticket) => void;
}

export function KanbanColumn({
  status,
  label,
  tickets,
  projectId,
  showProjectBadge,
  onCreate,
  onEdit,
  onOpenRunning,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-${status}`,
    data: { type: "column", status },
  });

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-surface)]/40 rounded-md border border-[var(--color-border)]">
      <div className="flex items-center justify-between h-9 px-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-foreground-muted)]">
            {label}
          </span>
          <span className="text-[10px] text-[var(--color-foreground-dim)]">
            {tickets.length}
          </span>
        </div>
        {onCreate && (
          <button
            onClick={() => onCreate(status)}
            className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
            aria-label="새 티켓"
            title={`${label}에 새 티켓 추가`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2",
          isOver && "bg-[var(--color-accent)]/5",
        )}
      >
        <SortableContext
          items={tickets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.length === 0 ? (
            <div className="text-[10px] text-center text-[var(--color-foreground-dim)] py-3">
              비어 있음
            </div>
          ) : (
            tickets.map((t) => (
              <SortableTicket
                key={t.id}
                ticket={t}
                projectId={projectId}
                showProjectBadge={showProjectBadge}
                onEdit={onEdit}
                onOpenRunning={onOpenRunning}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
