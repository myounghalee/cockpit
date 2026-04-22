import { create } from "zustand";

/**
 * 터미널 상단의 프로젝트 선택 picker 를 전역에서 열 수 있도록 open state 유지.
 * ⌘T (새 탭), ⌘⇧T (활성 탭에 split), 그리고 + 버튼이 같은 picker 를 공유한다.
 *
 * mode:
 *   "new"   → picker 선택 → createTab
 *   "split" → picker 선택 → splitRightmostInActiveTab
 */
export type NewTabPickerMode = "new" | "split";

interface NewTabPickerState {
  open: boolean;
  mode: NewTabPickerMode;
  setOpen: (open: boolean) => void;
  openPicker: (mode?: NewTabPickerMode) => void;
  closePicker: () => void;
}

export const useNewTabPickerStore = create<NewTabPickerState>((set) => ({
  open: false,
  mode: "new",
  setOpen: (open) => set({ open }),
  openPicker: (mode = "new") => set({ open: true, mode }),
  closePicker: () => set({ open: false }),
}));
