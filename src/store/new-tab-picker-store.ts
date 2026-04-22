import { create } from "zustand";

/**
 * ⌘T 단축키로 터미널 탭의 프로젝트 선택 picker 를 어디서나 열 수 있도록
 * 전역 open state 를 유지. terminal-tabs의 + 버튼도 이 store 를 공유한다.
 */
interface NewTabPickerState {
  open: boolean;
  setOpen: (open: boolean) => void;
  openPicker: () => void;
  closePicker: () => void;
}

export const useNewTabPickerStore = create<NewTabPickerState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  openPicker: () => set({ open: true }),
  closePicker: () => set({ open: false }),
}));
