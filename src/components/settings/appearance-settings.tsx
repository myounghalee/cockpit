"use client";

import { useTerminalStore } from "@/store/terminal-store";

export function AppearanceSettings() {
  const terminalFontSize = useTerminalStore((s) => s.terminalFontSize);
  const setTerminalFontSize = useTerminalStore((s) => s.setTerminalFontSize);
  const markdownFontSize = useTerminalStore((s) => s.markdownFontSize);
  const setMarkdownFontSize = useTerminalStore((s) => s.setMarkdownFontSize);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <h2 className="text-sm font-semibold">글자 크기</h2>

      <FontSizeRow
        label="터미널"
        hint="xterm 본문 — 8~32px"
        value={terminalFontSize}
        onChange={setTerminalFontSize}
        min={8}
        max={32}
        previewClass="font-mono"
      />

      <FontSizeRow
        label="파일 뷰어 (Markdown)"
        hint="렌더링 모드 본문 — 10~32px"
        value={markdownFontSize}
        onChange={setMarkdownFontSize}
        min={10}
        max={32}
        previewClass=""
      />
    </div>
  );
}

interface RowProps {
  label: string;
  hint: string;
  value: number;
  onChange: (px: number) => void;
  min: number;
  max: number;
  previewClass: string;
}

function FontSizeRow({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  previewClass,
}: RowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-[var(--color-foreground)]">
          {label}
        </label>
        <span className="text-[10px] text-[var(--color-foreground-dim)]">
          {hint}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent)]"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <span className="text-[10px] text-[var(--color-foreground-dim)]">
          px
        </span>
      </div>

      <div
        className={`rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground-muted)] ${previewClass}`}
        style={{ fontSize: value }}
      >
        The quick brown fox jumps over the lazy dog · 한글 미리보기 1234567890
      </div>
    </div>
  );
}
