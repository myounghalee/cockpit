"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Home,
  Folder,
  ChevronUp,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BrowseResponse {
  currentPath: string;
  home: string;
  nodes: Array<{
    name: string;
    path: string;
    absolutePath: string;
    type: "directory" | "file";
  }>;
  quickPaths: Array<{ name: string; path: string }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 단일 선택 콜백 */
  onPick?: (absolutePath: string) => void;
  /** 다중 선택 콜백. 주어지면 체크박스 UI 활성화 */
  onPickMultiple?: (absolutePaths: string[]) => void;
  initialPath?: string;
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  onPick,
  onPickMultiple,
  initialPath,
}: Props) {
  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const supportsMulti = !!onPickMultiple;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setData(null);
    const qs = currentPath ? `?path=${encodeURIComponent(currentPath)}` : "";
    fetch(`/api/fs/browse${qs}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as BrowseResponse;
      })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          // 경로 바뀌면 체크 초기화
          setChecked(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentPath]);

  const goUp = () => {
    if (!data) return;
    if (data.currentPath === data.home) return;
    const parent = data.currentPath.split("/").slice(0, -1).join("/") || "/";
    setCurrentPath(parent);
  };

  const toggleCheck = (absPath: string) => {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(absPath)) next.delete(absPath);
      else next.add(absPath);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (!data) return;
    setChecked((s) => {
      if (s.size === data.nodes.length) return new Set();
      return new Set(data.nodes.map((n) => n.absolutePath));
    });
  };

  const confirmSingle = () => {
    if (!data || !onPick) return;
    onPick(data.currentPath);
    onOpenChange(false);
  };

  const confirmMultiple = () => {
    if (checked.size === 0 || !onPickMultiple) return;
    onPickMultiple(Array.from(checked));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>폴더 선택</DialogTitle>

        {/* quickPaths */}
        {data?.quickPaths && data.quickPaths.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCurrentPath(data.home)}
              className="text-xs"
            >
              <Home size={12} /> Home
            </Button>
            {data.quickPaths.map((q) => (
              <Button
                key={q.path}
                size="sm"
                variant="ghost"
                onClick={() => setCurrentPath(q.path)}
                className="text-xs"
              >
                <Folder size={12} /> {q.name}
              </Button>
            ))}
          </div>
        )}

        {/* 현재 경로 (breadcrumb) */}
        <div className="mt-3 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5">
          <Button
            size="icon"
            variant="ghost"
            onClick={goUp}
            disabled={!data || data.currentPath === data.home}
            title="상위 폴더로"
          >
            <ChevronUp size={14} />
          </Button>
          <div className="flex-1 min-w-0 overflow-x-auto">
            {data ? (
              <Breadcrumb
                path={data.currentPath}
                onNavigate={(p) => setCurrentPath(p)}
              />
            ) : (
              <span className="text-xs font-mono text-[var(--color-foreground-dim)]">
                …
              </span>
            )}
          </div>
          {supportsMulti && data && data.nodes.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleCheckAll}
              className="text-xs"
            >
              {checked.size === data.nodes.length ? "전체 해제" : "전체 선택"}
            </Button>
          )}
        </div>

        {/* 목록 */}
        <div className="mt-2 h-[280px] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-1">
          {error ? (
            <div className="p-3 text-xs text-[var(--color-danger)]">{error}</div>
          ) : !data ? (
            <div className="p-3 text-xs text-[var(--color-foreground-muted)]">
              …
            </div>
          ) : data.nodes.length === 0 ? (
            <div className="p-3 text-xs text-[var(--color-foreground-dim)]">
              하위 폴더 없음
            </div>
          ) : (
            data.nodes.map((n) => (
              <div
                key={n.absolutePath}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-sm",
                  "hover:bg-[var(--color-surface-hover)]",
                )}
              >
                {supportsMulti && (
                  <input
                    type="checkbox"
                    checked={checked.has(n.absolutePath)}
                    onChange={() => toggleCheck(n.absolutePath)}
                    className="flex-shrink-0"
                  />
                )}
                <button
                  onDoubleClick={() => setCurrentPath(n.absolutePath)}
                  onClick={() =>
                    supportsMulti
                      ? toggleCheck(n.absolutePath)
                      : setCurrentPath(n.absolutePath)
                  }
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  title={
                    supportsMulti
                      ? "클릭 = 선택 · 더블클릭 = 진입"
                      : "클릭으로 진입"
                  }
                >
                  <Folder
                    size={12}
                    className="text-[var(--color-foreground-muted)] flex-shrink-0"
                  />
                  <span className="truncate">{n.name}</span>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs text-[var(--color-foreground-dim)]">
            {supportsMulti
              ? `${checked.size}개 선택됨 · 체크한 폴더들을 각각 프로젝트로 등록`
              : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            {supportsMulti ? (
              <>
                {onPick && (
                  <Button variant="outline" onClick={confirmSingle} disabled={!data}>
                    이 폴더 선택
                  </Button>
                )}
                <Button onClick={confirmMultiple} disabled={checked.size === 0}>
                  {checked.size}개 일괄 등록
                </Button>
              </>
            ) : (
              <Button onClick={confirmSingle} disabled={!data}>
                이 폴더 선택
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 경로의 각 세그먼트를 클릭 가능한 breadcrumb으로 표시 */
function Breadcrumb({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  // "/" → ["/"], "/Users/myoungha/x" → ["/", "Users", "myoungha", "x"]
  const segments = path.split("/").filter(Boolean);
  const items: Array<{ label: string; path: string }> = [
    { label: "/", path: "/" },
    ...segments.map((seg, i) => ({
      label: seg,
      path: "/" + segments.slice(0, i + 1).join("/"),
    })),
  ];

  return (
    <div className="flex items-center gap-0.5 text-xs font-mono whitespace-nowrap">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.path} className="flex items-center gap-0.5">
            <button
              onClick={() => onNavigate(item.path)}
              className={
                isLast
                  ? "text-[var(--color-foreground)] font-medium px-1"
                  : "text-[var(--color-foreground-muted)] hover:text-[var(--color-accent)] hover:underline px-1 rounded"
              }
              title={`${item.path} 로 이동`}
            >
              {item.label}
            </button>
            {!isLast && (
              <ChevronRight
                size={10}
                className="text-[var(--color-foreground-dim)] flex-shrink-0"
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
