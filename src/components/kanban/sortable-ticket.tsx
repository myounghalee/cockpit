"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Ticket } from "@/types/ticket";
import { TicketCard } from "./ticket-card";

interface Props {
  ticket: Ticket;
  projectId: string;
  showProjectBadge?: boolean;
  onEdit: (t: Ticket) => void;
  onOpenRunning?: (t: Ticket) => void;
}

export function SortableTicket({
  ticket,
  projectId,
  showProjectBadge,
  onEdit,
  onOpenRunning,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: ticket.id,
    data: { ticket, status: ticket.status },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TicketCard
        ticket={ticket}
        projectId={projectId}
        showProjectBadge={showProjectBadge}
        onEdit={onEdit}
        onOpenRunning={onOpenRunning}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}
