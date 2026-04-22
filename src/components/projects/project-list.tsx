"use client";

import { useState } from "react";
import { Plus, FolderPlus, Star, FolderOpen } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { useProjects, useUpdateProject } from "@/hooks/use-projects";
import { ProjectItem } from "./project-item";
import { ProjectFolderGroup } from "./project-folder-group";
import { CreateProjectDialog } from "./create-project-dialog";
import { CreateFolderDialog } from "./create-folder-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import type { Project, ProjectFolder } from "@/types/project";

export function ProjectList() {
  const { data, isLoading, error } = useProjects();
  const updateMut = useUpdateProject();
  const [createOpen, setCreateOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    const projectId = active.id as string;
    const overData = over.data?.current as
      | { type: "folder"; folderId: string }
      | { type: "unfiled" }
      | undefined;

    if (!overData) return;

    const targetFolderId =
      overData.type === "folder" ? overData.folderId : null;

    const project = data?.projects.find((p) => p.id === projectId);
    if (!project || project.folderId === targetFolderId) return;

    updateMut.mutate({ id: projectId, folderId: targetFolderId });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-[var(--color-foreground-muted)]">
        불러오는 중…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-[var(--color-danger)]">
        오류: {(error as Error).message}
      </div>
    );
  }
  if (!data) return null;

  const favorites = data.projects.filter((p) => p.isFavorite);
  const byFolder = new Map<string | null, Project[]>();
  for (const p of data.projects) {
    const key = p.folderId ?? null;
    const arr = byFolder.get(key) ?? [];
    arr.push(p);
    byFolder.set(key, arr);
  }
  const unassigned = byFolder.get(null) ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <h1 className="text-sm font-semibold">Projects</h1>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCreateFolderOpen(true)}
            title="새 폴더"
          >
            <FolderPlus size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCreateOpen(true)}
            title="새 프로젝트"
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          {data.projects.length === 0 && data.folders.length === 0 && (
            <EmptyState onAdd={() => setCreateOpen(true)} />
          )}

          {favorites.length > 0 && (
            <div>
              <div className="px-1 py-1 text-xs text-[var(--color-warning)] uppercase tracking-wider flex items-center gap-1">
                <Star size={12} fill="currentColor" /> Favorites
              </div>
              <div className="flex flex-col gap-0.5 pl-1">
                {favorites.map((p) => (
                  <ProjectItem
                    key={`fav-${p.id}`}
                    project={p}
                    folders={data.folders}
                    onEdit={setEditing}
                    draggable
                  />
                ))}
              </div>
            </div>
          )}

          {data.folders.map((f) => (
            <ProjectFolderGroup
              key={f.id}
              folder={f}
              projects={byFolder.get(f.id) ?? []}
              folders={data.folders}
              onEditProject={setEditing}
            />
          ))}

          {unassigned.length > 0 && (
            <UnfiledDropZone
              projects={unassigned}
              folders={data.folders}
              onEdit={setEditing}
            />
          )}
        </div>
      </DndContext>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        folders={data.folders}
      />
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
      />
      <EditProjectDialog
        project={editing}
        folders={data.folders}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function UnfiledDropZone({
  projects,
  folders,
  onEdit,
}: {
  projects: Project[];
  folders: ProjectFolder[];
  onEdit: (p: Project) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "unfiled",
    data: { type: "unfiled" },
  });

  return (
    <div ref={setNodeRef}>
      <div className="px-1 py-1 text-xs text-[var(--color-foreground-muted)] uppercase tracking-wider">
        Unfiled
      </div>
      <div
        className={`flex flex-col gap-0.5 pl-1 min-h-[32px] rounded transition-colors ${
          isOver ? "bg-[var(--color-accent)]/10" : ""
        }`}
      >
        {projects.map((p) => (
          <ProjectItem
            key={p.id}
            project={p}
            folders={folders}
            onEdit={onEdit}
            draggable
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <FolderOpen
        size={40}
        className="text-[var(--color-foreground-dim)] mb-3"
      />
      <p className="text-sm text-[var(--color-foreground-muted)] mb-1">
        등록된 프로젝트가 없습니다.
      </p>
      <p className="text-xs text-[var(--color-foreground-dim)] mb-4">
        로컬 폴더를 프로젝트로 등록하고 터미널·칸반·Git을 한 곳에서 관리하세요.
      </p>
      <Button onClick={onAdd} size="sm">
        <Plus size={14} /> 첫 프로젝트 등록
      </Button>
    </div>
  );
}
