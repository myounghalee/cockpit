import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveProjectState {
  activeProjectId: string | null;
  activeProjectPath: string | null; // 빠른 접근용 캐시
  // 사용자가 명시적으로 "활성 해제"를 눌렀는가. 이 값이 true면
  // ActiveProjectBadge의 자동-기본선택 useEffect가 재선택하지 않는다.
  // (즉 null = 전체 보기 상태를 persist하는 용도)
  explicitlyUnset: boolean;
  setActive: (id: string | null, path?: string | null) => void;
}

export const useActiveProjectStore = create<ActiveProjectState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeProjectPath: null,
      // 기본값 true — 신규 사용자는 "전체 보기"로 시작.
      // 특정 프로젝트 선택 시 false로 전환, "활성 해제" 시 다시 true.
      explicitlyUnset: true,
      setActive: (id, path) =>
        set({
          activeProjectId: id,
          activeProjectPath: path ?? null,
          explicitlyUnset: id === null,
        }),
    }),
    { name: "cockpit-active-project" },
  ),
);
