// Cockpit Electron preload script
// contextIsolation: true 환경에서 renderer에 노출할 API 정의.
import { contextBridge, ipcRenderer } from "electron";

export type CockpitUpdateStatus =
  | "idle"
  | "checking"
  | "updating"
  | "ready"
  | "failed";

contextBridge.exposeInMainWorld("cockpit", {
  /** 현재 업데이트 상태 1회 조회 (컴포넌트 mount 시 초기값 용도) */
  getUpdateStatus: (): Promise<CockpitUpdateStatus> =>
    ipcRenderer.invoke("cockpit:get-update-status"),
  /** 업데이트 상태 실시간 구독. unsubscribe 함수 반환 */
  onUpdateStatus: (cb: (status: CockpitUpdateStatus) => void) => {
    const listener = (_: unknown, status: CockpitUpdateStatus) => cb(status);
    ipcRenderer.on("cockpit:update-status", listener);
    return () => ipcRenderer.off("cockpit:update-status", listener);
  },
  /** "지금 적용" — 앱 재시작하여 새 빌드 로드 */
  applyUpdate: (): Promise<void> => ipcRenderer.invoke("cockpit:apply-update"),
  /** 마지막 업데이트 실패 메시지 조회 */
  getUpdateError: (): Promise<string | null> =>
    ipcRenderer.invoke("cockpit:get-update-error"),
});
