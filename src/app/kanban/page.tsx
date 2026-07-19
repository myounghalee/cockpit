"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProjectScope } from "@/store/project-scope-store";
import { useProjects } from "@/hooks/use-projects";
import { KanbanBoard } from "@/components/kanban/board";

/**
 * Next.js 15는 useSearchParams()를 쓰는 클라이언트 컴포넌트를
 * 반드시 <Suspense> 경계 안에 두도록 강제한다 (CSR bailout).
 * 그래서 search params를 읽는 실제 페이지는 내부 컴포넌트로 분리하고,
 * default export에서 Suspense로 감싸 노출한다.
 */
export default function KanbanPage() {
  return (
    <Suspense fallback={null}>
      <KanbanPageInner />
    </Suspense>
  );
}

function KanbanPageInner() {
  const [scopeProjectId, setScopeProjectId] = useProjectScope("kanban");
  const { data } = useProjects();
  const projects = data?.projects ?? [];
  const searchParams = useSearchParams();
  const hasTicketParam = !!searchParams?.get("ticket");

  // 알림 클릭 진입(?ticket=...)이면 어떤 프로젝트의 티켓이든 찾을 수 있도록
  // 이번 방문에 한해 전체 보기로 시작한다. 사용자가 직접 고르면 해제.
  const [ticketOverride, setTicketOverride] = useState(hasTicketParam);
  const selectedProjectId = ticketOverride ? null : scopeProjectId;

  const handleProjectChange = (id: string | null) => {
    setTicketOverride(false);
    setScopeProjectId(id);
  };

  return (
    <KanbanBoard
      key={selectedProjectId ?? "__all__"}
      projectId={selectedProjectId}
      projects={projects}
      onProjectChange={handleProjectChange}
    />
  );
}
