"use client";

/**
 * Insights 탭용 경량 SVG 차트 모음.
 * 외부 차트 라이브러리 없이 순수 SVG + Tailwind로 구성.
 */

export interface PieSlice {
  label: string;
  value: number;
  color?: string;
}

/**
 * 도넛형 파이 차트 + 우측 범례.
 * 총합 0이면 빈 상태 메시지 표시.
 */
export function PieChart({
  data,
  size = 160,
  thickness = 28,
}: {
  data: PieSlice[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-[var(--color-foreground-dim)]">
        데이터 없음
      </div>
    );
  }

  const r = size / 2;
  const innerR = r - thickness;
  let cumulative = 0;

  return (
    <div className="flex items-center gap-5">
      <svg
        viewBox={`${-r} ${-r} ${size} ${size}`}
        width={size}
        height={size}
        className="flex-shrink-0"
      >
        {data.map((d, i) => {
          if (d.value === 0) return null;
          const startAngle = (cumulative / total) * Math.PI * 2;
          cumulative += d.value;
          const endAngle = (cumulative / total) * Math.PI * 2;
          const large = endAngle - startAngle > Math.PI ? 1 : 0;

          // 각도 → 좌표 (12시 방향이 0, 시계방향)
          const pt = (angle: number, radius: number) => ({
            x: Math.sin(angle) * radius,
            y: -Math.cos(angle) * radius,
          });

          const outerStart = pt(startAngle, r);
          const outerEnd = pt(endAngle, r);
          const innerStart = pt(startAngle, innerR);
          const innerEnd = pt(endAngle, innerR);

          const path = [
            `M ${outerStart.x} ${outerStart.y}`,
            `A ${r} ${r} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
            `L ${innerEnd.x} ${innerEnd.y}`,
            `A ${innerR} ${innerR} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
            "Z",
          ].join(" ");

          return (
            <path
              key={i}
              d={path}
              fill={d.color ?? "#6b7280"}
              opacity={0.9}
              className="transition-opacity hover:opacity-100"
            >
              <title>
                {d.label}: {d.value} ({((d.value / total) * 100).toFixed(1)}%)
              </title>
            </path>
          );
        })}
        {/* 중앙 총합 */}
        <text
          x={0}
          y={-4}
          textAnchor="middle"
          className="fill-[var(--color-foreground)] font-bold"
          fontSize="22"
        >
          {total}
        </text>
        <text
          x={0}
          y={14}
          textAnchor="middle"
          className="fill-[var(--color-foreground-dim)]"
          fontSize="10"
        >
          total
        </text>
      </svg>

      {/* 범례 */}
      <ul className="flex flex-col gap-1.5 text-xs min-w-0">
        {data.map((d, i) => {
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : "0";
          return (
            <li key={i} className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: d.color ?? "#6b7280" }}
              />
              <span className="truncate text-[var(--color-foreground)]">
                {d.label}
              </span>
              <span className="text-[var(--color-foreground-dim)] ml-auto flex-shrink-0">
                {d.value} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** 옵션 — 오른쪽에 함께 표시할 보조 정보 (예: 프로젝트 경로) */
  subLabel?: string;
  color?: string;
}

/**
 * 수평 막대 차트.
 * 긴 리스트 적합. 최대값 기준 정규화.
 */
export function BarChart({
  data,
  accent = "#8b5cf6",
}: {
  data: BarDatum[];
  accent?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) {
    return (
      <div className="text-xs text-[var(--color-foreground-dim)] py-4">
        데이터 없음
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-xs group"
          title={d.subLabel}
        >
          <span className="w-28 truncate text-[var(--color-foreground)]">
            {d.label}
          </span>
          <div className="flex-1 h-5 bg-[var(--color-surface-hover)] rounded relative overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${(d.value / max) * 100}%`,
                backgroundColor: d.color ?? accent,
                opacity: 0.85,
              }}
            />
          </div>
          <span className="w-10 text-right font-mono text-[var(--color-foreground-muted)] tabular-nums">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 스파크라인 (꺾은선). 일별 추이용.
 * values 길이로 가로 스케일 결정.
 */
export function Sparkline({
  values,
  labels,
  height = 60,
  accent = "var(--color-accent)",
}: {
  values: number[];
  labels?: string[];
  height?: number;
  accent?: string;
}) {
  if (values.length === 0)
    return (
      <div className="text-xs text-[var(--color-foreground-dim)] py-4">
        데이터 없음
      </div>
    );
  const max = Math.max(...values, 1);
  const w = 800;
  const h = height;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * h * 0.9 - 4;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPath = `${points} ${w},${h} 0,${h}`;

  const peakIdx = values.indexOf(max);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${h}px` }}
      >
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPath} fill="url(#sparkGrad)" />
        <polyline
          points={points}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.length > 0 && values.length <= 35 && (
          <>
            {values.map((v, i) => (
              <circle
                key={i}
                cx={i * step}
                cy={h - (v / max) * h * 0.9 - 4}
                r={i === peakIdx ? 3 : 1.5}
                fill={accent}
              />
            ))}
          </>
        )}
      </svg>
      {labels && (
        <div className="flex justify-between text-[10px] text-[var(--color-foreground-dim)] mt-1">
          <span>{labels[0]}</span>
          {labels.length > 2 && <span>{labels[Math.floor(labels.length / 2)]}</span>}
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}
