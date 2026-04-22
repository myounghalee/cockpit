import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "system" | "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    {
      name: "cockpit-theme",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  // Electron 환경: main process 에 테마 모드를 알려 창 배경색(타이틀바)도 맞춘다.
  // 브라우저 환경에서는 window.cockpit 이 없어 no-op.
  if (typeof window !== "undefined") {
    const bridge = (window as { cockpit?: { setThemeMode?: (m: Theme) => void } })
      .cockpit;
    bridge?.setThemeMode?.(theme);
  }
}
