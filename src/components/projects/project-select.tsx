"use client";

import { useEffect } from "react";
import { ChevronDown, Star, Folder } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

/** 내부 전용 sentinel — 바깥 API는 항상 null을 "전체"로 쓴다. */
const ALL = "__all__";

interface ExtraOption {
  value: string;
  label: string;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  /** null이면 "전체" 항목을 노출하지 않는다 (프로젝트 필수 화면용) */
  allLabel?: string | null;
  /** 프로젝트 목록 위에 끼워 넣을 추가 항목 (예: 메모의 "전역") */
  extraOptions?: ExtraOption[];
  /** 아무것도 선택되지 않았고 allLabel도 없을 때 트리거에 표시할 문구 */
  placeholder?: string;
  className?: string;
}

/**
 * 화면 공통 프로젝트 선택기. 즐겨찾기 / 폴더별 / 미분류로 그룹핑한다.
 *
 * 선택 값이 삭제된 프로젝트를 가리키면 자동으로 해제(null)해서
 * 영원히 빈 화면에 갇히는 상황을 막는다.
 */
export function ProjectSelect({
  value,
  onChange,
  allLabel = "전체 프로젝트",
  extraOptions = [],
  placeholder = "프로젝트 선택",
  className,
}: Props) {
  const { data } = useProjects();
  const projects = data?.projects ?? [];

  // stale ID 정리 — persist된 선택이 삭제된 프로젝트를 가리키는 경우
  useEffect(() => {
    if (!data || !value) return;
    if (extraOptions.some((o) => o.value === value)) return;
    if (!projects.some((p) => p.id === value)) onChange(null);
    // onChange/extraOptions는 렌더마다 새 참조라 의존성에서 제외한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, value, projects]);

  const selectedLabel =
    extraOptions.find((o) => o.value === value)?.label ??
    projects.find((p) => p.id === value)?.name ??
    (allLabel ?? placeholder);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 h-8 max-w-[220px] rounded-md border border-[var(--color-border)]",
            "bg-[var(--color-surface)] px-2 text-xs text-[var(--color-foreground)]",
            "hover:bg-[var(--color-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
            className,
          )}
          title={selectedLabel}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown
            size={12}
            className="text-[var(--color-foreground-dim)] flex-shrink-0"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 max-h-[70vh] overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={value ?? ALL}
          onValueChange={(v) => onChange(v === ALL ? null : v)}
        >
          {allLabel !== null && (
            <>
              <DropdownMenuRadioItem value={ALL}>
                {allLabel}
              </DropdownMenuRadioItem>
              {extraOptions.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {/* 즐겨찾기 */}
          {(() => {
            const favs = projects.filter((p) => p.isFavorite);
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
                {sortByName(favs).map((p) => (
                  <ProjectRadioItem key={`fav-${p.id}`} project={p} />
                ))}
              </>
            );
          })()}

          {/* 폴더별 그룹 */}
          {(data?.folders ?? []).map((f) => {
            const projs = projects.filter((p) => p.folderId === f.id);
            if (projs.length === 0) return null;
            return (
              <div key={f.id}>
                <GroupLabel icon={<Folder size={10} />} label={f.name} />
                {sortByName(projs).map((p) => (
                  <ProjectRadioItem key={p.id} project={p} />
                ))}
              </div>
            );
          })}

          {/* 미분류 */}
          {(() => {
            const unfiled = projects.filter((p) => !p.folderId);
            if (unfiled.length === 0) return null;
            return (
              <>
                <GroupLabel label="Unfiled" />
                {sortByName(unfiled).map((p) => (
                  <ProjectRadioItem key={p.id} project={p} />
                ))}
              </>
            );
          })()}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const sortByName = (list: Project[]) =>
  list.slice().sort((a, b) => a.name.localeCompare(b.name));

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
