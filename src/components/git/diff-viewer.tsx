"use client";

import { useGitDiff } from "@/hooks/use-git";
import { cn } from "@/lib/utils";
import type { DiffHunk, DiffLine } from "@/types/git";

interface Props {
  projectId: string;
  commit?: string;
  path: string;
  staged?: boolean;
  /** 추적 안 되는 파일: /dev/null 과 비교하여 전체 추가 diff로 표시 */
  untracked?: boolean;
}

/**
 * hunk의 연속된 del/add 블록을 좌/우 행으로 매칭.
 */
interface Row {
  left: DiffLine | null;
  right: DiffLine | null;
}
function pairHunkLines(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.type === "ctx") {
      rows.push({ left: l, right: l });
      i++;
      continue;
    }
    // del/add 블록 수집
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "del") {
      dels.push(lines[i++]);
    }
    while (i < lines.length && lines[i].type === "add") {
      adds.push(lines[i++]);
    }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      rows.push({
        left: dels[k] ?? null,
        right: adds[k] ?? null,
      });
    }
  }
  return rows;
}

export function DiffViewer({
  projectId,
  commit,
  path,
  staged,
  untracked,
}: Props) {
  const { data, isLoading, error } = useGitDiff(projectId, {
    commit,
    path,
    staged,
    untracked,
  });

  if (isLoading)
    return <div className="p-4 text-xs text-[var(--color-foreground-muted)]">diff 불러오는 중…</div>;
  if (error)
    return <div className="p-4 text-xs text-[var(--color-danger)]">{(error as Error).message}</div>;
  if (!data) return null;
  if (data.oversize) {
    return (
      <div className="p-6 text-xs text-[var(--color-foreground-muted)]">
        파일이 너무 커서 diff를 표시할 수 없습니다 ({(data.size / 1024 / 1024).toFixed(1)} MB).
      </div>
    );
  }
  const meta = data.meta;
  if (data.hunks.length === 0) {
    if (meta?.isBinary) {
      return (
        <div className="p-6 text-xs text-[var(--color-foreground-dim)] flex flex-col gap-1">
          <span className="text-[var(--color-foreground-muted)]">바이너리 파일</span>
          <span>
            {meta.isNew
              ? "새 바이너리 파일이 추가되었습니다."
              : meta.isDeleted
                ? "바이너리 파일이 삭제되었습니다."
                : "바이너리 파일이 변경되었습니다."}
            {data.size > 0 && ` (${formatBytes(data.size)})`}
          </span>
        </div>
      );
    }
    if (meta?.isNew) {
      return (
        <div className="p-6 text-xs text-[var(--color-foreground-dim)] flex flex-col gap-1">
          <span className="text-[var(--color-success)]">+ 새 빈 파일</span>
          <span>내용 없는 파일이 추가되었습니다.</span>
        </div>
      );
    }
    if (meta?.isDeleted) {
      return (
        <div className="p-6 text-xs text-[var(--color-foreground-dim)] flex flex-col gap-1">
          <span className="text-[var(--color-danger)]">− 빈 파일 삭제</span>
        </div>
      );
    }
    if (meta?.isRename) {
      return (
        <div className="p-6 text-xs text-[var(--color-foreground-dim)]">
          이름만 변경되었습니다 (내용 동일).
        </div>
      );
    }
    return (
      <div className="p-6 text-xs text-[var(--color-foreground-dim)]">
        변경 없음
      </div>
    );
  }

  return (
    <div className="font-mono text-xs">
      {meta?.isNew && (
        <div className="px-3 py-1.5 text-[10px] bg-[var(--color-success)]/10 text-[var(--color-success)] border-b border-[var(--color-border)]">
          새 파일 (+{countAddedLines(data.hunks)} lines)
        </div>
      )}
      {meta?.isDeleted && (
        <div className="px-3 py-1.5 text-[10px] bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-b border-[var(--color-border)]">
          삭제된 파일
        </div>
      )}
      {data.hunks.map((hunk, hi) => (
        <HunkView key={hi} hunk={hunk} />
      ))}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function countAddedLines(hunks: DiffHunk[]): number {
  let n = 0;
  for (const h of hunks) for (const l of h.lines) if (l.type === "add") n++;
  return n;
}

function HunkView({ hunk }: { hunk: DiffHunk }) {
  const rows = pairHunkLines(hunk.lines);
  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="px-3 py-1 text-[10px] bg-[var(--color-surface)]/50 text-[var(--color-foreground-dim)]">
        {hunk.header}
      </div>
      {/*
       * table-layout:fixed + 퍼센트 width로 본문 두 칸을 항상 50/50 고정.
       * content 길이에 따라 각 행의 컬럼 너비가 들쭉날쭉해지는 문제 해결.
       * 긴 줄은 break-all로 셀 내부에서 줄바꿈되어 가로 스크롤이 생기지 않는다.
       */}
      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "3rem" }} />
          <col style={{ width: "calc(50% - 3rem)" }} />
          <col style={{ width: "3rem" }} />
          <col style={{ width: "calc(50% - 3rem)" }} />
        </colgroup>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <Cell line={r.left} side="left" />
              <Cell line={r.right} side="right" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  line,
  side,
}: {
  line: DiffLine | null;
  side: "left" | "right";
}) {
  const empty = line === null;
  const bg =
    !empty &&
    ((side === "left" && line!.type === "del") ||
      (side === "right" && line!.type === "add"))
      ? side === "left"
        ? "bg-[var(--color-danger)]/10"
        : "bg-[var(--color-success)]/10"
      : "";
  const no = side === "left" ? line?.oldNo : line?.newNo;
  return (
    <>
      <td
        className={cn(
          "select-none px-2 py-0 text-right text-[10px] text-[var(--color-foreground-dim)] border-r border-[var(--color-border)]",
          bg,
        )}
      >
        {no ?? ""}
      </td>
      <td
        className={cn(
          // whitespace-pre-wrap + break-all: 긴 줄이 셀을 밀어내지 않고 줄바꿈됨
          "px-2 py-0 text-[var(--color-foreground)]",
          "whitespace-pre-wrap break-all",
          bg,
        )}
      >
        {empty ? " " : line!.text || " "}
      </td>
    </>
  );
}
