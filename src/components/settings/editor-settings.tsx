"use client";

import { Input } from "@/components/ui/input";
import { useTerminalStore } from "@/store/terminal-store";

const OPTIONS: Array<{ value: string; label: string; cmd: string }> = [
  { value: "vscode", label: "Visual Studio Code", cmd: "code" },
  { value: "cursor", label: "Cursor", cmd: "cursor" },
  { value: "webstorm", label: "WebStorm", cmd: "webstorm" },
  { value: "idea", label: "IntelliJ IDEA", cmd: "idea" },
  { value: "sublime", label: "Sublime Text", cmd: "subl" },
  { value: "custom", label: "사용자 정의", cmd: "" },
];

export function EditorSettings() {
  const preferredEditor = useTerminalStore((s) => s.preferredEditor);
  const setPreferredEditor = useTerminalStore((s) => s.setPreferredEditor);
  const customEditorCommand = useTerminalStore((s) => s.customEditorCommand);
  const setCustomEditorCommand = useTerminalStore(
    (s) => s.setCustomEditorCommand,
  );

  const current = OPTIONS.find((o) => o.value === preferredEditor) ?? OPTIONS[0];
  const isCustom = preferredEditor === "custom";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <h2 className="text-sm font-semibold">외부 에디터</h2>
      <p className="text-xs text-[var(--color-foreground-muted)]">
        프로젝트/칸반에서 &quot;에디터로 열기&quot;를 누르면 실행할 명령입니다.
        선택한 에디터의 CLI가 PATH에 있어야 합니다 (예: VS Code는 Command
        Palette → &quot;Install <code>code</code> command in PATH&quot;).
      </p>

      <label className="text-xs text-[var(--color-foreground-muted)]">
        기본 에디터
        <select
          value={preferredEditor}
          onChange={(e) => setPreferredEditor(e.target.value)}
          className="w-full mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.cmd && ` — ${o.cmd}`}
            </option>
          ))}
        </select>
      </label>

      {isCustom && (
        <label className="text-xs text-[var(--color-foreground-muted)]">
          커스텀 명령
          <Input
            value={customEditorCommand}
            onChange={(e) => setCustomEditorCommand(e.target.value)}
            placeholder="예: /usr/local/bin/mvim"
            className="font-mono"
          />
          <span className="block mt-1 text-[10px] text-[var(--color-foreground-dim)]">
            경로가 인자로 자동으로 붙습니다. 예: {customEditorCommand || "<cmd>"}{" "}
            /path/to/project
          </span>
        </label>
      )}

      {!isCustom && (
        <div className="text-[10px] text-[var(--color-foreground-dim)]">
          실행 명령: <code className="font-mono">{current.cmd} &lt;경로&gt;</code>
        </div>
      )}
    </div>
  );
}
