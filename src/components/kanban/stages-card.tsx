"use client";

import { Check, FileText, Circle } from "lucide-react";
import { useTicketStages, type StageInfo } from "@/hooks/use-ticket-stages";

const ORDER: Array<{ key: StageInfo["stage"]; label: string }> = [
  { key: "plan", label: "Plan" },
  { key: "design", label: "Design" },
  { key: "do", label: "Do" },
  { key: "check", label: "Check" },
  { key: "report", label: "Report" },
];

interface Props {
  ticketId: string;
  /** 현재 패널에서 열람 중인 단계 */
  selected?: StageInfo["stage"] | null;
  /** done/current 상태의 단계만 클릭 시 호출 */
  onSelect?: (stage: StageInfo["stage"]) => void;
}

/** PDCA 5단계의 산출물 존재 여부를 한눈에 보여주는 카드 (탭으로도 동작) */
export function StagesCard({ ticketId, selected, onSelect }: Props) {
  const { data } = useTicketStages(ticketId);
  const current = data?.currentStage ?? null;

  const currentIdx = current
    ? ORDER.findIndex((o) => o.key === current)
    : -1;

  // 단계 상태 판정:
  //   현재 단계보다 이전  → done (산출물 파일 없어도 지나간 단계로 간주: 예) Do)
  //   현재 단계           → current
  //   현재 단계보다 이후  → pending
  //   단, 산출물 파일이 이미 존재하면 무조건 done으로 우선 표기
  const getStageState = (
    stage: StageInfo | undefined,
    keyIdx: number,
  ) => {
    if (stage?.exists) return "done" as const;
    if (currentIdx < 0) return "pending" as const;
    if (keyIdx < currentIdx) return "done" as const;
    if (keyIdx === currentIdx) return "current" as const;
    return "pending" as const;
  };

  return (
    <div className="rounded border border-[var(--color-border)] p-2">
      <div className="flex items-center gap-1.5 mb-2">
        <FileText size={11} className="text-[var(--color-foreground-dim)]" />
        <span className="text-[10px] text-[var(--color-foreground-dim)]">
          PDCA 단계
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        {ORDER.map((o, idx) => {
          const stage = data?.stages.find((s) => s.stage === o.key);
          const state = getStageState(stage, idx);
          const isLast = idx === ORDER.length - 1;
          const clickable = state === "done" || state === "current";
          const isSelected = selected === o.key;
          const title =
            stage?.exists && stage.updatedAt
              ? `${o.label} · ${new Date(stage.updatedAt).toLocaleString()}`
              : o.label;

          const inner = (
            <>
              {state === "done" ? (
                <Check size={11} className="text-green-400" />
              ) : state === "current" ? (
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              ) : (
                <Circle
                  size={9}
                  className="text-[var(--color-foreground-dim)]"
                />
              )}
              <span
                className={`text-[10px] ${isSelected ? "font-bold" : "font-medium"} ${
                  state === "current"
                    ? "text-purple-400"
                    : state === "done"
                      ? "text-green-400"
                      : "text-[var(--color-foreground-dim)]"
                }`}
              >
                {o.label}
              </span>
            </>
          );

          // 선택 상태는 하단 밑줄 + 볼드로 표시 (박스 강조 대신)
          const baseCls =
            "flex-1 flex flex-col items-center gap-0.5 py-1 border-b-2 transition-colors";
          const stateCls = isSelected
            ? "border-[var(--color-accent)]"
            : state === "current"
              ? "border-transparent"
              : state === "done"
                ? "border-transparent"
                : "border-transparent opacity-40";

          return (
            <div key={o.key} className="flex items-center flex-1 min-w-0">
              {clickable && onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(o.key)}
                  title={title}
                  className={`${baseCls} ${stateCls} hover:text-[var(--color-foreground)] cursor-pointer`}
                >
                  {inner}
                </button>
              ) : (
                <div className={`${baseCls} ${stateCls}`} title={title}>
                  {inner}
                </div>
              )}
              {!isLast && (
                <div className="w-2 h-px bg-[var(--color-border)] shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
