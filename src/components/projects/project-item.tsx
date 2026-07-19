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
  const updateMut = useUpdateProject();
  const deleteMut = useDeleteProject();

  // Draggable id: draggable 일 때만 project.id 사용 (DnD-kit 식별자).
  // Favorites 섹션처럼 draggable=false 인 경우 id 를 readonly-prefix 로 두어 같은
  // project.id 가 원본/즐겨찾기 두 곳에 중복 등록되지 않도록 한다. (중복되면
  // 원본을 드래그할 때 즐겨찾기 쪽도 transform 이 적용돼 같이 움직임)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: isDraggable ? project.id : `readonly-${project.id}`,
      disabled: !isDraggable,
    });

  const toggleFav = () =>
    updateMut.mutate({ id: project.id, isFavorite: !project.isFavorite });

  const moveToFolder = (folderId: string | null) =>
    updateMut.mutate({ id: project.id, folderId });

  const remove = () => {
    if (!confirm(`프로젝트 "${project.name}"을(를) 삭제할까요?`)) return;
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
