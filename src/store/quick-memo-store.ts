import { create } from "zustand";

interface QuickMemoState {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

// 빠른 메모 캡처 다이얼로그의 전역 상태.
// ⌘⇧N 단축키로 어디서나 호출 가능하게 하기 위한 최소 상태.
export const useQuickMemoStore = create<QuickMemoState>((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
}));
