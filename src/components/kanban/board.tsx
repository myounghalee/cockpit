"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTickets, useUpdateTicket } from "@/hooks/use-tickets";
import { Button } from "@/components/ui/button";
import { Plus, Inbox } from "lucide-react";
import { OpenInEditorButton } from "@/components/projects/open-in-editor-button";
import { ProjectSelect } from "@/components/projects/project-select";
import type { Ticket, TicketStatus } from "@/types/ticket";
import { KanbanColumn } from "./column";
import { TicketCard } from "./ticket-card";
import { TicketDialog } from "./ticket-dialog";
import { JiraDialog } from "./jira-dialog";
import { RunningTicketPanel } from "./running-ticket-panel";

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Progress" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

interface Project {
  id: string;
  name: string;
  path: string;
}

interface Props {
  projectId: string | null; // null = 전체 보기
  projects?: Project[];
  onProjectChange?: (id: string | null) => void;
}

export function KanbanBoard({
  projectId,
  projects,
  onProjectChange,
}: Props) {
  const { data, isLoading } = useTickets(projectId);
  const updateMut = useUpdateTicket(projectId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [createStatus, setCreateStatus] = useState<TicketStatus>("backlog");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [runningTicketId, setRunningTicketId] = useState<string | null>(null);

  // ?ticket=<id> URL 파라미터(알림 클릭 등)로 상세 패널 자동 오픈
  const ticketFromUrl = searchParams?.get("ticket") ?? null;
  useEffect(() => {
    if (!ticketFromUrl) return;
    const tickets = data?.tickets ?? [];
    if (tickets.some((t) => t.id === ticketFromUrl)) {
      setRunningTicketId(ticketFromUrl);
      // URL 파라미터 제거 — 닫은 뒤 다시 열리지 않게
      router.replace("/kanban");
    }
  }, [ticketFromUrl, data?.tickets, router]);
  // Jira 이슈 임포트용
  const [importIssue, setImportIssue] = useState<{
    key: string;
    summary: string;
    description: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const tickets = data?.tickets ?? [];
  const activeTicket = tickets.find((t) => t.id === activeId) ?? null;
  const runningTicket = runningTicketId
    ? (tickets.find((t) => t.id === runningTicketId) ?? null)
    : null;
  const showProjectBadge = !projectId; // 전체 보기일 때 프로젝트 뱃지 표시
  const selectedProjectPath =
    projectId && projects ? projects.find((p) => p.id === projectId)?.path : null;

  const byStatus = (s: TicketStatus) =>
    tickets
      .filter((t) => t.status === s)
      .sort(
        (a, b) =>
          a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const active = e.active;
    const over = e.over;
    if (!over) return;

    const draggedTicket = tickets.find((t) => t.id === active.id);
    if (!draggedTicket) return;

    const overData = over.data?.current as
      | { type?: "column"; status?: TicketStatus; ticket?: Ticket }
      | undefined;
    const targetStatus: TicketStatus | undefined =
      overData?.type === "column"
        ? overData.status
        : (overData?.ticket?.status as TicketStatus | undefined);

    if (!targetStatus || targetStatus === draggedTicket.status) return;

    updateMut.mutate({ id: draggedTicket.id, status: targetStatus });
  };

  const openCreate = (status: TicketStatus) => {
    setEditing(null);
    setImportIssue(null);
    setCreateStatus(status);
    setDialogOpen(true);
  };
  const openEdit = (t: Ticket) => {
    setEditing(t);
    setImportIssue(null);
    setDialogOpen(true);
  };

  const openRunning = (t: Ticket) => {
    setRunningTicketId(t.id);
  };

  /** Jira 패널에서 임포트 시 호출 */
  const handleJiraImport = (issue: {
    key: string;
    summary: string;
    description: string;
  }) => {
    setEditing(null);
    setImportIssue(issue);
    setCreateStatus("backlog");
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3 min-w-0">
          {/* 프로젝트 드롭다운 */}
          {projects && onProjectChange && (
            <ProjectSelect
              value={projectId ?? null}
              onChange={onProjectChange}
              allLabel="전체"
            />
          )}
          <div className="text-[10px] text-[var(--color-foreground-dim)] whitespace-nowrap">
            {tickets.length} tickets
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {projectId && selectedProjectPath && (
            <OpenInEditorButton
              path={selectedProjectPath}
              className="px-2 h-7 rounded border border-[var(--color-border)] text-xs hover:bg-[var(--color-surface-hover)]"
              label="에디터로 열기"
            />
          )}
          {projectId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setJiraOpen(true)}
              title="내 미해결 Jira 이슈"
            >
              <Inbox size={14} /> 미해결 이슈
            </Button>
          )}
          <Button size="sm" onClick={() => openCreate("backlog")}>
            <Plus size={14} /> 새 티켓
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-foreground-muted)]">
          불러오는 중…
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div
              className="h-full min-h-0 flex gap-3 p-3 overflow-x-auto"
              // 우측 상세 패널이 열리면 패널 폭만큼 padding을 더 줘서
              // 가려지는 컬럼도 좌우 스크롤로 접근할 수 있게 한다.
              style={{
                paddingRight:
                  "calc(0.75rem + var(--running-panel-width, 0px))",
              }}
            >
              {COLUMNS.map((c) => (
                <div
                  key={c.status}
                  className={
                    runningTicketId
                      ? "w-[420px] shrink-0 flex flex-col"
                      : "flex-1 min-w-0 flex flex-col"
                  }
                >
                  <KanbanColumn
                    status={c.status}
                    label={c.label}
                    tickets={byStatus(c.status)}
                    projectId={projectId ?? ""}
                    showProjectBadge={showProjectBadge}
                    onCreate={projectId ? openCreate : undefined}
                    onEdit={openEdit}
                    onOpenRunning={openRunning}
                  />
                </div>
              ))}
            </div>
            <DragOverlay>
              {activeTicket ? (
                <div className="opacity-90 rotate-1">
                  <TicketCard
                    ticket={activeTicket}
                    projectId={projectId ?? ""}
                    onEdit={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {runningTicket && (
            <RunningTicketPanel
              ticket={runningTicket}
              projectId={projectId}
              onClose={() => setRunningTicketId(null)}
            />
          )}
        </div>
      )}

      {projectId && (
        <JiraDialog
          open={jiraOpen}
          onOpenChange={setJiraOpen}
          onImport={handleJiraImport}
        />
      )}

      <TicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        projects={projects}
        ticket={editing}
        defaultStatus={editing ? undefined : createStatus}
        importIssue={importIssue}
      />
    </div>
  );
}
