"use client";

import { useTerminalStore } from "@/store/terminal-store";
import { cn } from "@/lib/utils";

export function AppearanceSettings() {
  const terminalFontSize = useTerminalStore((s) => s.terminalFontSize);
  const setTerminalFontSize = useTerminalStore((s) => s.setTerminalFontSize);
  const markdownFontSize = useTerminalStore((s) => s.markdownFontSize);
  const setMarkdownFontSize = useTerminalStore((s) => s.setMarkdownFontSize);
  const terminalTheme = useTerminalStore((s) => s.terminalTheme);
  const setTerminalTheme = useTerminalStore((s) => s.setTerminalTheme);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <h2 className="text-sm font-semibold">터미널 테마</h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label className="text-xs text-[var(--color-foreground)]">
            색상
          </label>
          <span className="text-[10px] text-[var(--color-foreground-dim)]">
            UI 와 다르게 강제 가능
          </span>
        </div>
        <div className="flex gap-1">
          {(
            [
              { value: "auto", label: "자동", hint: "UI 따라감" },
              { value: "light", label: "라이트", hint: "흰 배경" },
              { value: "dark", label: "다크", hint: "검정 배경" },
            ] as const
          ).map((opt) => {
            const active = terminalTheme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTerminalTheme(opt.value)}
                className={cn(
                  "flex-1 px-3 py-2 text-xs rounded border transition-colors text-left",
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "border-[var(--color-border)] text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
                )}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] opacity-80">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      <h2 className="text-sm font-semibold pt-2 border-t border-[var(--color-border)]">
        글자 크기
      </h2>

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
