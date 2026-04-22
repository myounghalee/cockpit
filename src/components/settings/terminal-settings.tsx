"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

const IS_WIN =
  typeof navigator !== "undefined" &&
  navigator.platform.toLowerCase().startsWith("win");

// OS별 추천 셸 프리셋
const PRESETS = IS_WIN
  ? [
      { label: "PowerShell", value: "powershell.exe" },
      { label: "PowerShell 7 (pwsh)", value: "pwsh.exe" },
      { label: "Command Prompt", value: "cmd.exe" },
      { label: "Git Bash", value: "C:\\Program Files\\Git\\bin\\bash.exe" },
      { label: "WSL", value: "wsl.exe" },
    ]
  : [
      { label: "zsh", value: "/bin/zsh" },
      { label: "bash", value: "/bin/bash" },
      { label: "sh", value: "/bin/sh" },
    ];

export function TerminalSettings() {
  const { data, isLoading } = useSettings();
  const updateMut = useUpdateSettings();
  const [shellPath, setShellPath] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setShellPath(data.terminal.shellPath);
  }, [data]);

  async function save() {
    await updateMut.mutateAsync({ terminal: { shellPath } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (isLoading) return <div className="text-xs">…</div>;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <h2 className="text-sm font-semibold">터미널 셸</h2>

      <div className="text-xs text-[var(--color-foreground-muted)]">
        터미널에서 사용할 기본 셸 경로입니다. 비워두면 자동으로 감지됩니다.
      </div>

      {/* 프리셋 버튼들 */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setShellPath(p.value)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              shellPath === p.value
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="text-xs text-[var(--color-foreground-muted)]">
        커스텀 경로
        <Input
          value={shellPath}
          onChange={(e) => setShellPath(e.target.value)}
          placeholder={
            IS_WIN
              ? "예: C:\\Program Files\\Git\\bin\\bash.exe"
              : "예: /bin/zsh"
          }
          className="font-mono"
        />
      </label>

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
        <Button onClick={save} disabled={updateMut.isPending}>
          {updateMut.isPending ? "저장 중…" : "저장"}
        </Button>
        {saved && (
          <span className="text-xs text-[var(--color-success)]">
            ✓ 저장됨. 새 터미널 탭부터 적용됩니다.
          </span>
        )}
      </div>
    </div>
  );
}
