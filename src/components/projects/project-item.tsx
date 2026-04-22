"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Star, MoreHorizontal, Folder, ExternalLink } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteProject,
  useUpdateProject,
} from "@/hooks/use-projects";
import { useActiveProjectStore } from "@/store/active-project-store";
import { cn } from "@/lib/utils";
import type { Project, ProjectFolder } from "@/types/project";

interface Props {
  project: Project;
  folders: ProjectFolder[];
  onEdit: (p: Project) => void;
  draggable?: boolean;
}

export function ProjectItem({ project, folders, onEdit, draggable: isDraggable }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname === `/projects/${project.id}`;
  const activeId = useActiveProjectStore((s) => s.activeProjectId);
  const setActive = useActiveProjectStore((s) => s.setActive);
  const updateMut = useUpdateProject();
  const deleteMut = useDeleteProject();

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: project.id,
      disabled: !isDraggable,
    });

  const isActiveProject = activeId === project.id;

  const toggleFav = () =>
    updateMut.mutate({ id: project.id, isFavorite: !project.isFavorite });

  const moveToFolder = (folderId: string | null) =>
    updateMut.mutate({ id: project.id, folderId });

  const remove = () => {
    if (!confirm(`프로젝트 "${project.name}"을(를) 삭제할까요?`)) return;
    // 활성 프로젝트면 먼저 해제 (useEffect에서 다른 프로젝트로 자동 전환됨)
    if (isActiveProject) setActive(null, null);
    // 프로젝트 상세 페이지에서 삭제 중이면 목록으로 이동 (404 화면 방지)
    if (isActive) router.push("/projects");
    deleteMut.mutate(project.id);
  };

  const revealInFinder = async () => {
    try {
      await fetch("/api/system/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: project.path }),
      });
    } catch {
      // ignore
    }
  };

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 50,
        opacity: 0.85,
      }
    : undefined;

  // drag 영역 — draggable 일 때 바깥 div 전체에 listeners 적용.
  // activationConstraint(distance: 6) 덕에 6px 이상 움직여야 drag 시작 → 그 이하는 click 으로 취급.
  const dragProps = isDraggable ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={cn(
        isDragging && "pointer-events-none",
        isDraggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <Link
        href={`/projects/${project.id}`}
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
          isActive
            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            : "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]",
        )}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFav();
          }}
          className={cn(
            "p-0.5 rounded hover:bg-[var(--color-surface-hover)] flex-shrink-0",
            project.isFavorite
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-foreground-dim)] opacity-0 group-hover:opacity-100",
          )}
          aria-label={project.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
          title={project.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
        >
          <Star size={12} fill={project.isFavorite ? "currentColor" : "none"} />
        </button>

        <span className="flex-1 min-w-0 truncate">{project.name}</span>

        {isActiveProject && (
          <span className="text-[10px] text-[var(--color-accent)] bg-[var(--color-accent)]/15 px-1.5 rounded">
            active
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)] opacity-0 group-hover:opacity-100"
              aria-label="메뉴"
            >
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => setActive(project.id, project.path)}
            >
              활성 프로젝트로 설정
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit(project)}>
              이름·폴더 수정
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={toggleFav}>
              {project.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={revealInFinder}>
              <ExternalLink size={12} />
              파일 탐색기에서 열기
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Folder size={14} /> 폴더 이동
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => moveToFolder(null)}>
                  (미분류)
                </DropdownMenuItem>
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onSelect={() => moveToFolder(f.id)}
                  >
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={remove}
              className="text-[var(--color-danger)]"
            >
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Link>
    </div>
  );
}
