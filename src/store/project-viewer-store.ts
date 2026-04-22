import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SelectedFileState {
  relPath: string;
  absolutePath: string;
  name: string;
}

interface ProjectViewerState {
  /** projectId → 마지막으로 선택한 파일 */
  selectedFileByProject: Record<string, SelectedFileState | null>;
  setSelectedFile: (projectId: string, file: SelectedFileState | null) => void;
  getSelectedFile: (projectId: string) => SelectedFileState | null;
}

export const useProjectViewerStore = create<ProjectViewerState>()(
  persist(
    (set, get) => ({
      selectedFileByProject: {},
      setSelectedFile: (projectId, file) =>
        set((s) => ({
          selectedFileByProject: {
            ...s.selectedFileByProject,
            [projectId]: file,
          },
        })),
      getSelectedFile: (projectId) =>
        get().selectedFileByProject[projectId] ?? null,
    }),
    {
      name: "cockpit-project-viewer",
    },
  ),
);
