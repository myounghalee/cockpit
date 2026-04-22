import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveProjectState {
  activeProjectId: string | null;
  activeProjectPath: string | null; // 빠른 접근용 캐시
  setActive: (id: string | null, path?: string | null) => void;
}

export const useActiveProjectStore = create<ActiveProjectState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeProjectPath: null,
      setActive: (id, path) =>
        set({ activeProjectId: id, activeProjectPath: path ?? null }),
    }),
    { name: "cockpit-active-project" },
  ),
);
