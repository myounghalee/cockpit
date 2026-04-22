"use client";

import { ChevronDown, ChevronRight, Folder, Pencil, Trash2 } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { useDeleteFolder, useUpdateFolder } from "@/hooks/use-projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Project, ProjectFolder } from "@/types/project";
import { ProjectItem } from "./project-item";

interface Props {
  folder: ProjectFolder;
  projects: Project[];
  folders: ProjectFolder[];
  onEditProject: (p: Project) => void;
}

export function ProjectFolderGroup({
  folder,
  projects,
  folders,
  onEditProject,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const updateMut = useUpdateFolder();
  const deleteMut = useDeleteFolder();

  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });

  const toggle = () =>
    updateMut.mutate({ id: folder.id, collapsed: !folder.collapsed });

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) {
      updateMut.mutate({ id: folder.id, name: trimmed });
    }
    setRenaming(false);
  };

  const remove = () => {
    if (
      !confirm(
        `폴더 "${folder.name}"을(를) 삭제할까요? 소속 프로젝트들은 '미분류'로 이동합니다.`,
      )
    )
      return;
    deleteMut.mutate(folder.id);
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded transition-colors ${
        isOver ? "bg-[var(--color-accent)]/10" : ""
      }`}
    >
      <div className="group flex items-center gap-1 px-1 py-1 text-xs text-[var(--color-foreground-muted)] uppercase tracking-wider">
        <button
          onClick={toggle}
          className="p-0.5 rounded hover:bg-[var(--color-surface-hover)]"
          aria-label={folder.collapsed ? "펼치기" : "접기"}
        >
          {folder.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        <Folder size={12} />
        {renaming ? (
          <form onSubmit={submitRename} className="flex-1">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submitRename}
              className="h-6 px-1 text-xs uppercase"
            />
          </form>
        ) : (
          <span
            className="flex-1 truncate cursor-pointer"
            onDoubleClick={() => setRenaming(true)}
          >
            {folder.name}
          </span>
        )}
        <span className="text-[10px] text-[var(--color-foreground-dim)]">
          {projects.length}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] opacity-0 group-hover:opacity-100"
              aria-label="폴더 메뉴"
            >
              <Pencil size={10} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              이름 변경
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={remove}
              className="text-[var(--color-danger)]"
            >
              <Trash2 size={12} /> 폴더 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!folder.collapsed && (
        <div className="flex flex-col gap-0.5 pl-1 min-h-[28px]">
          {projects.length === 0 ? (
            <div className="px-3 py-1 text-xs text-[var(--color-foreground-dim)]">
              {isOver ? "여기에 놓기" : "비어 있음"}
            </div>
          ) : (
            projects.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                folders={folders}
                onEdit={onEditProject}
                draggable
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
