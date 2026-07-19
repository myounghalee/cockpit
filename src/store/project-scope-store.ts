import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 프로젝트 선택을 기억하는 화면(탭) 단위.
 *
 * 예전의 "활성 프로젝트"(전역 단일 상태)를 대체한다. 터미널 탭이 탭마다
 * 자기 cwd를 소유하듯, 각 화면이 자기 프로젝트 선택을 독립적으로 소유한다.
 * 즉 Git에서 프로젝트를 바꿔도 칸반/메모는 영향을 받지 않는다.
 */
export type ProjectScope = "git" | "kanban" | "memo" | "insights";

interface ProjectScopeState {
  /** scope별 마지막 선택. null 또는 미존재 = 전체 보기 */
  selectedByScope: Partial<Record<ProjectScope, string | null>>;
  setSelected: (scope: ProjectScope, id: string | null) => void;
}

export const useProjectScopeStore = create<ProjectScopeState>()(
  persist(
    (set) => ({
      selectedByScope: {},
      setSelected: (scope, id) =>
        set((s) => ({
          selectedByScope: { ...s.selectedByScope, [scope]: id },
        })),
    }),
    { name: "cockpit-project-scope" },
  ),
);

/**
 * 화면 하나의 프로젝트 선택을 읽고 쓴다. localStorage에 persist되므로
 * 탭을 떠났다 돌아와도, 앱을 재시작해도 마지막 본 프로젝트가 그대로 복원된다.
 */
export function useProjectScope(
  scope: ProjectScope,
): [string | null, (id: string | null) => void] {
  const selected = useProjectScopeStore(
    (s) => s.selectedByScope[scope] ?? null,
  );
  const setSelected = useProjectScopeStore((s) => s.setSelected);
  return [selected, (id) => setSelected(scope, id)];
}
