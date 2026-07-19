"use client";

import { ProjectList } from "@/components/projects/project-list";
import { FolderOpen } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";

export default function ProjectsPage() {
  const { isLoading } = useProjects();

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[360px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <ProjectList />
      </aside>
      <section className="flex-1 min-w-0 flex items-center justify-center p-8">
        <div className="text-center text-[var(--color-foreground-muted)]">
          <FolderOpen
            size={40}
            className="mx-auto text-[var(--color-foreground-dim)] mb-3"
          />
          {isLoading ? (
            <p className="text-sm">불러오는 중…</p>
          ) : (
            <>
              <p className="text-sm">왼쪽에서 프로젝트를 선택하세요.</p>
              <p className="text-xs text-[var(--color-foreground-dim)] mt-1">
                또는 상단{" "}
                <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-hover)] text-[10px]">
                  +
                </kbd>{" "}
                버튼으로 새 프로젝트를 등록하세요.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
