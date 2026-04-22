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
      explicitlyUnset: false,
      setActive: (id, path) =>
        set({
          activeProjectId: id,
          activeProjectPath: path ?? null,
          // null로 설정 → 사용자 의사로 해제. 특정 id → 다시 자동선택 허용.
          explicitlyUnset: id === null,
        }),
    }),
    { name: "cockpit-active-project" },
  ),
);
