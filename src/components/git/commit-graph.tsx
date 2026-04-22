"use client";

import { useMemo, useState } from "react";
import { useGitGraph } from "@/hooks/use-git";
import type { GraphCommit } from "@/types/git";
import { cn } from "@/lib/utils";
import { GitBranch, GitFork } from "lucide-react";

interface Props {
  projectId: string;
  selectedHash: string | null;
  onSelect: (hash: string) => void;
}

/** git-pilot 원본 동일 값 */
const ROW_HEIGHT = 32;
const COL_WIDTH = 14;
const NODE_RADIUS = 4;
const PADDING_LEFT = 8;
/** 첫 원이 경계에 묻히지 않도록 위쪽 여백만 주고, 내부 y 계산은 git-pilot과 동일 */
const TOP_GUTTER = 4;

/** git-pilot과 동일한 팔레트 */
const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
];

/**
 * 컴팩트한 레인 배치:
 * - first parent는 같은 레인 유지
 * - secondary parent는 **미리 예약하지 않음** — 실제로 커밋을 만날 때 빈 레인에 배정
 * - 덕분에 여러 feature 브랜치가 모두 같은 lane 1을 순차로 재사용
 */
function layoutCommits(commits: GraphCommit[]) {
  const hashToIndex = new Map<string, number>();
  commits.forEach((c, i) => hashToIndex.set(c.hash, i));

  const lanes: number[] = new Array(commits.length).fill(-1);
  const laneOccupied: boolean[] = [];
  const laneExpects: (string | null)[] = [];

  // 각 커밋의 부모 중 "이미 예약된 레인이 있는지" 미리 맵으로 빠르게 참조
  const childrenOf = new Map<string, string[]>();
  for (const c of commits) {
    for (const p of c.parents) {
      const arr = childrenOf.get(p) ?? [];
      arr.push(c.hash);
      childrenOf.set(p, arr);
    }
  }

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];

    // 1. 이 hash를 기다리던 레인이 있으면 거기에 배정 (first parent 체인)
    let assignedLane = laneExpects.indexOf(commit.hash);
    if (assignedLane === -1) {
      // 없으면 가장 왼쪽 빈 레인
      assignedLane = laneOccupied.findIndex((o) => !o);
      if (assignedLane === -1) assignedLane = laneOccupied.length;
    }

    lanes[i] = assignedLane;
    laneOccupied[assignedLane] = true;
    laneExpects[assignedLane] = null;

    // 2. 이 커밋이 다른 레인에서도 기다려지고 있었다면 해제
    //    (merge 시 두 레인이 같은 조상을 기다리는 경우)
    for (let l = 0; l < laneExpects.length; l++) {
      if (l !== assignedLane && laneExpects[l] === commit.hash) {
        laneOccupied[l] = false;
        laneExpects[l] = null;
      }
    }

    // 3. first parent는 같은 레인에서 계속
    //    단, first parent가 **더 작은** 번호의 레인에서 이미 기다려지고 있으면
    //    현재 레인을 즉시 해제 (해당 레인이 다음 feature에 재사용 가능).
    //    lane 0(또는 더 낮은 레인)은 해제하지 않음 → 기준 축 유지.
    if (commit.parents.length > 0) {
      const firstParent = commit.parents[0];
      const alreadyExpectedAt = laneExpects.indexOf(firstParent);
      if (
        alreadyExpectedAt !== -1 &&
        alreadyExpectedAt < assignedLane // 더 왼쪽 레인이 있을 때만
      ) {
        laneOccupied[assignedLane] = false;
        laneExpects[assignedLane] = null;
      } else {
        laneExpects[assignedLane] = firstParent;
      }
    } else {
      laneOccupied[assignedLane] = false;
    }

    // 4. 다음 이터레이션에서 찾을 일 없는 레인 닫기
    const remaining = commits.slice(i + 1);
    for (let lane = 0; lane < laneExpects.length; lane++) {
      const expected = laneExpects[lane];
      if (expected && !remaining.some((c) => c.hash === expected)) {
        laneOccupied[lane] = false;
        laneExpects[lane] = null;
      }
    }
  }

  const nodes = commits.map((commit, i) => ({
    hash: commit.hash,
    x: lanes[i] * COL_WIDTH + PADDING_LEFT,
    y: i * ROW_HEIGHT + ROW_HEIGHT / 2,
    color: COLORS[lanes[i] % COLORS.length],
    lane: lanes[i],
  }));

  const edges: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
  }> = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const node = nodes[i];
    for (let p = 0; p < commit.parents.length; p++) {
      const parentIdx = hashToIndex.get(commit.parents[p]);
      if (parentIdx !== undefined) {
        const parentNode = nodes[parentIdx];
        edges.push({
          x1: node.x,
          y1: node.y,
          x2: parentNode.x,
          y2: parentNode.y,
          color: p === 0 ? node.color : parentNode.color,
        });
      } else {
        // parent가 limit 범위 밖 → 바닥까지 수직선으로 "계속됨" 표시
        edges.push({
          x1: node.x,
          y1: node.y,
          x2: node.x,
          y2: commits.length * ROW_HEIGHT,
          color: node.color,
        });
      }
    }
  }

  const maxLane = Math.max(...lanes, 0) + 1;
  return { nodes, edges, maxLane };
}

export function CommitGraph({ projectId, selectedHash, onSelect }: Props) {
  const [allBranches, setAllBranches] = useState(true);
  // git-pilot과 동일한 기본 limit (500은 레일 혼잡도를 키움)
  const { data, isLoading, error } = useGitGraph(projectId, 200, allBranches);
  const commits = data?.commits ?? [];

  const { nodes, edges, maxLane } = useMemo(
    () => layoutCommits(commits),
    [commits],
  );
  const graphWidth = maxLane * COL_WIDTH + PADDING_LEFT * 2;
  const totalHeight = commits.length * ROW_HEIGHT + 10;

  return (
    <div className="h-full overflow-auto">
      {/* 상단 sticky 헤더 + 브랜치 범위 토글 */}
      <div className="sticky top-0 z-20 bg-[var(--color-background)] border-b border-[var(--color-border)] px-3 py-1.5 flex items-center gap-3">
        <div className="text-[10px] text-[var(--color-foreground-dim)] uppercase tracking-wider">
          ↓ 최신 → 오래된 순 · {commits.length} 커밋
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden">
          <button
            onClick={() => setAllBranches(true)}
            className={cn(
              "flex items-center gap-1 px-2 h-6 text-[10px]",
              allBranches
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
            )}
            title="모든 브랜치 (git log --all)"
          >
            <GitFork size={10} /> 모든 브랜치
          </button>
          <button
            onClick={() => setAllBranches(false)}
            className={cn(
              "flex items-center gap-1 px-2 h-6 text-[10px] border-l border-[var(--color-border)]",
              !allBranches
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
            )}
            title="현재 HEAD 브랜치만"
          >
            <GitBranch size={10} /> 현재 브랜치만
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="p-6 text-xs text-[var(--color-foreground-muted)]">
          그래프 불러오는 중…
        </div>
      )}
      {error && (
        <div className="p-6 text-xs text-[var(--color-danger)]">
          {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && commits.length === 0 && (
        <div className="p-6 text-xs text-[var(--color-foreground-dim)]">
          커밋이 없습니다.
        </div>
      )}

      {/* 컬럼 헤더 — IntelliJ 스타일 */}
      {commits.length > 0 && (
        <div
          className="sticky top-[30px] z-10 flex items-center px-2 h-7 bg-[var(--color-surface)]/60 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-foreground-dim)]"
          style={{ minWidth: "max-content" }}
        >
          <div style={{ width: graphWidth }} className="flex-shrink-0">
            Graph
          </div>
          <div className="flex-1 min-w-[200px] px-2">Subject</div>
          <div className="w-[110px] flex-shrink-0 px-2 truncate">Author</div>
          <div className="w-[60px] flex-shrink-0 px-2 text-right">Date</div>
          <div className="w-[70px] flex-shrink-0 px-2 font-mono text-right">
            Hash
          </div>
        </div>
      )}

      {/* SVG + 커밋 리스트 */}
      {commits.length > 0 && (
        <div className="flex min-w-max" style={{ paddingTop: TOP_GUTTER }}>
          <svg
            width={graphWidth}
            height={totalHeight}
            className="flex-shrink-0"
          >
            {edges.map((edge, i) => {
              // 같은 레인: 수직선
              if (edge.x1 === edge.x2) {
                return (
                  <line
                    key={i}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke={edge.color}
                    strokeWidth={2}
                  />
                );
              }
              // 다른 레인: IntelliJ 스타일 — 한 행 내에서 대각선, 그 이후는 수직
              // 자식 y1 → 자식 y1 + ROW_HEIGHT (한 행 아래) 까지 대각선
              // 그 다음은 parent 레인에서 수직으로 parent y2 까지
              const diagonalEndY = edge.y1 + ROW_HEIGHT;
              const needsVertical = diagonalEndY < edge.y2;
              return (
                <path
                  key={i}
                  d={
                    needsVertical
                      ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${diagonalEndY} L ${edge.x2} ${edge.y2}`
                      : `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`
                  }
                  stroke={edge.color}
                  strokeWidth={2}
                  fill="none"
                  strokeLinejoin="round"
                />
              );
            })}
            {nodes.map((node, i) => {
              const isHead = commits[i].isHead;
              return (
                <circle
                  key={node.hash}
                  cx={node.x}
                  cy={node.y}
                  r={isHead ? NODE_RADIUS + 2 : NODE_RADIUS}
                  fill={isHead ? node.color : "var(--color-background)"}
                  stroke={node.color}
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          <div className="flex-1 min-w-0">
            {commits.map((c, i) => {
              const active = selectedHash === c.hash;
              const laneColor = nodes[i]?.color;
              return (
                <button
                  key={c.hash}
                  onClick={() => onSelect(c.hash)}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "flex items-center w-full text-left text-xs border-b border-[var(--color-border)]/30",
                    "hover:bg-[var(--color-surface-hover)]",
                    active && "bg-[var(--color-accent)]/15",
                  )}
                >
                  {/* Subject 컬럼 — HEAD/브랜치/태그 뱃지 + 메시지 */}
                  <div className="flex-1 min-w-[200px] flex items-center gap-1.5 px-2 min-w-0">
                    {c.isHead && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white flex-shrink-0"
                        style={{ backgroundColor: laneColor }}
                      >
                        HEAD
                      </span>
                    )}
                    {c.branches.slice(0, 2).map((b) => (
                      <span
                        key={`b-${b}`}
                        className="text-[10px] px-1.5 rounded font-mono flex-shrink-0 truncate max-w-[120px] border"
                        style={{
                          color: laneColor,
                          borderColor: `${laneColor}60`,
                          backgroundColor: `${laneColor}15`,
                        }}
                        title={b}
                      >
                        {b}
                      </span>
                    ))}
                    {c.branches.length > 2 && (
                      <span className="text-[10px] text-[var(--color-foreground-dim)] flex-shrink-0">
                        +{c.branches.length - 2}
                      </span>
                    )}
                    {c.tags.slice(0, 1).map((t) => (
                      <span
                        key={`t-${t}`}
                        className="text-[10px] px-1.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] font-mono flex-shrink-0"
                        title={t}
                      >
                        🏷 {t}
                      </span>
                    ))}
                    <span
                      className={cn(
                        "flex-1 min-w-0 truncate",
                        active
                          ? "text-[var(--color-accent)] font-medium"
                          : "text-[var(--color-foreground)]",
                      )}
                    >
                      {c.message}
                    </span>
                  </div>

                  {/* Author */}
                  <div className="w-[110px] flex-shrink-0 px-2 truncate text-[10px] text-[var(--color-foreground-muted)]">
                    {c.author}
                  </div>

                  {/* Date */}
                  <div className="w-[60px] flex-shrink-0 px-2 text-right text-[10px] text-[var(--color-foreground-dim)]">
                    {c.date}
                  </div>

                  {/* Hash */}
                  <div className="w-[70px] flex-shrink-0 px-2 font-mono text-right text-[10px] text-[var(--color-foreground-dim)]">
                    {c.shortHash}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
