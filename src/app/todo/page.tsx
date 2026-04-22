"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Archive, ArchiveRestore, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemos, type MemoProjectFilter } from "@/hooks/use-memos";
import { useProjects } from "@/hooks/use-projects";
import { useActiveProjectStore } from "@/store/active-project-store";
import { MemoList } from "@/components/todo/memo-list";
import { MemoEditor } from "@/components/todo/memo-editor";
import { NewMemoDialog } from "@/components/todo/new-memo-dialog";
import { ConvertDialog } from "@/components/todo/convert-dialog";
import type { Memo } from "@/types/memo";

export default function TodoPage() {
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects ?? [];
  const activeId = useActiveProjectStore((s) => s.activeProjectId);

  // 필터: null (전체) | "__global__" (전역만) | projectId
  const [filter, setFilter] = useState<MemoProjectFilter>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useMemos(filter, { archived: showArchived });
  const memos = useMemo<Memo[]>(() => data?.memos ?? [], [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newMemoOpen, setNewMemoOpen] = useState(false);
  const [convertMemo, setConvertMemo] = useState<Memo | null>(null);

  // 첫 로딩 또는 현재 선택 메모가 사라졌을 때 첫 메모 자동 선택
  useEffect(() => {
    if (!memos.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    const exists = memos.find((m) => m.id === selectedId);
    if (!exists) {
      setSelectedId(memos[0].id);
    }
  }, [memos, selectedId]);

  const selectedMemo = memos.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 mr-2">
          <StickyNote size={16} className="text-[var(--color-accent)]" />
          <h1 className="text-sm font-semibold">ToDo</h1>
        </div>

        <select
          value={filter === null ? "__all__" : filter}
          onChange={(e) => {
            const v = e.target.value;
            setFilter(v === "__all__" ? null : (v as MemoProjectFilter));
          }}
          className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="__all__">전체 메모</option>
          <option value="__global__">전역 (프로젝트 없음)</option>
          {activeId && (
            <option value={activeId}>
              {projects.find((p) => p.id === activeId)?.name ?? "(활성)"}
            </option>
          )}
          <optgroup label="프로젝트">
            {projects
              .filter((p) => p.id !== activeId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </optgroup>
        </select>

        <div className="flex-1" />

        <Button
          variant={showArchived ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowArchived((s) => !s)}
          title={showArchived ? "보관함 숨기기" : "보관함 보기"}
        >
          {showArchived ? (
            <ArchiveRestore size={14} />
          ) : (
            <Archive size={14} />
          )}
          <span className="text-xs">{showArchived ? "보관함" : "활성"}</span>
        </Button>

        <Button size="sm" onClick={() => setNewMemoOpen(true)}>
          <Plus size={14} />
          <span className="text-xs">새 메모</span>
        </Button>
      </header>

      {/* Body: 리스트 + 에디터 */}
      <div className="flex-1 flex min-h-0">
        {/* 좌측 리스트 */}
        <div className="w-80 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-foreground-dim)]">
              로딩 중...
            </div>
          ) : (
            <MemoList
              memos={memos}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {/* 우측 에디터 */}
        {selectedMemo ? (
          <MemoEditor
            key={selectedMemo.id}
            memo={selectedMemo}
            onRequestConvert={() => setConvertMemo(selectedMemo)}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-foreground-dim)]">
            <StickyNote size={32} className="mb-3 opacity-30" />
            <div className="text-sm">메모를 선택하거나 새로 만드세요</div>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => setNewMemoOpen(true)}
            >
              <Plus size={14} />
              <span className="text-xs">첫 메모 만들기</span>
            </Button>
          </div>
        )}
      </div>

      <NewMemoDialog
        open={newMemoOpen}
        onOpenChange={setNewMemoOpen}
        onCreated={(id) => setSelectedId(id)}
        defaultProjectId={
          typeof filter === "string" && filter !== "__global__"
            ? filter
            : filter === "__global__"
              ? "__global__"
              : undefined
        }
      />

      <ConvertDialog
        memo={convertMemo}
        onOpenChange={(open) => !open && setConvertMemo(null)}
      />
    </div>
  );
}
