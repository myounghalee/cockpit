"use client";

import { Monitor, Sun, Moon } from "lucide-react";
import { useThemeStore, type Theme } from "@/store/theme-store";

const THEMES: { value: Theme; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "시스템", icon: Monitor },
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
];

export function ThemeSettings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <h2 className="text-sm font-semibold">화면 테마</h2>
      <div className="flex gap-2">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex flex-col items-center gap-1.5 rounded-md border px-4 py-3 text-xs transition-colors ${
              theme === value
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
