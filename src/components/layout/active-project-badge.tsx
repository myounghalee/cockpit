"use client";

import { useEffect } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useActiveProjectStore } from "@/store/active-project-store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronUp, Star, Plane, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

interface Props {
  collapsed: boolean;
}

export function ActiveProjectBadge({ collapsed }: Props) {
  const { data } = useProjects();
  const activeId = useActiveProjectStore((s) => s.activeProjectId);
  const setActive = useActiveProjectStore((s) => s.setActive);

  // stale ID 정리 + 최초 로드 시 기본값 선택
  useEffect(() => {
    if (!data) return;
    if (data.projects.length === 0) {
      if (activeId) setActive(null, null);
      return;
    }
    const exists = data.projects.find((p) => p.id === activeId);
    if (!exists) {
      const preferred =
        data.projects.find((p) => p.isFavorite) ?? data.projects[0];
      setActive(preferred.id, preferred.path);
    } else if (exists.path !== useActiveProjectStore.getState().activeProjectPath) {
      // path 변경 감지 시 동기화
      setActive(exists.id, exists.path);
    }
  }, [data, activeId, setActive]);

  const active = data?.projects.find((p) => p.id === activeId) ?? null;

  if (!data) {
    return null;
  }

  if (data.projects.length === 0) {
    if (collapsed) return null;
    return (
      <div className="p-2 text-[11px] text-[var(--color-foreground-dim)] border-t border-[var(--color-border)]">
        프로젝트 없음
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--color-border)] p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              "hover:bg-[var(--color-surface-hover)]",
              "text-left",
            )}
            title={active ? `활성 프로젝트: ${active.name}` : "프로젝트 선택"}
          >
            <div className="w-6 h-6 rounded bg-[var(--color-accent)]/15 flex items-center justify-center flex-shrink-0">
              <Plane size={12} className="text-[var(--color-accent)]" />
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[var(--color-foreground-dim)] uppercase tracking-wider">
                    Active
                  </div>
                  <div className="truncate text-xs font-medium">
                    {active ? active.name : "선택하세요"}
                  </div>
                </div>
                <ChevronUp size={12} className="text-[var(--color-foreground-dim)] flex-shrink-0" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={collapsed ? "start" : "end"}
          side="top"
          className="w-64 max-h-[70vh] overflow-y-auto"
        >
          <DropdownMenuRadioGroup
            value={activeId ?? ""}
            onValueChange={(v) => {
              const p = data.projects.find((p) => p.id === v);
              if (p) setActive(p.id, p.path);
            }}
          >
            {/* 즐겨찾기 */}
            {(() => {
              const favs = data.projects.filter((p) => p.isFavorite);
              if (favs.length === 0) return null;
              return (
                <>
                  <GroupLabel
                    icon={
                      <Star
                        size={10}
                        className="text-[var(--color-warning)]"
                        fill="currentColor"
                      />
                    }
                    label="Favorites"
                  />
                  {favs
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <ProjectRadioItem key={`fav-${p.id}`} project={p} />
                    ))}
                </>
              );
            })()}

            {/* 폴더별 그룹 */}
            {data.folders.map((f) => {
              const projs = data.projects.filter((p) => p.folderId === f.id);
              if (projs.length === 0) return null;
              return (
                <div key={f.id}>
                  <GroupLabel
                    icon={<Folder size={10} />}
                    label={f.name}
                  />
                  {projs
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <ProjectRadioItem key={p.id} project={p} />
                    ))}
                </div>
              );
            })}

            {/* 미분류 */}
            {(() => {
              const unfiled = data.projects.filter((p) => !p.folderId);
              if (unfiled.length === 0) return null;
              return (
                <>
                  <GroupLabel label="Unfiled" />
                  {unfiled
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <ProjectRadioItem key={p.id} project={p} />
                    ))}
                </>
              );
            })()}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setActive(null, null)}>
            활성 해제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function GroupLabel({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1 px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--color-foreground-muted)]">
      {icon}
      {label}
    </div>
  );
}

function ProjectRadioItem({ project }: { project: Project }) {
  return (
    <DropdownMenuRadioItem value={project.id}>
      {project.isFavorite && (
        <Star
          size={10}
          className="text-[var(--color-warning)]"
          fill="currentColor"
        />
      )}
      <span className="truncate">{project.name}</span>
    </DropdownMenuRadioItem>
  );
}
