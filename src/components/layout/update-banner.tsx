"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";

type UpdateStatus =
  | "idle"
  | "checking"
  | "updating"
  | "ready"
  | "failed";

interface CockpitBridge {
  getUpdateStatus: () => Promise<UpdateStatus>;
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void;
  applyUpdate: () => Promise<void>;
  getUpdateError: () => Promise<string | null>;
}

declare global {
  interface Window {
    cockpit?: CockpitBridge;
  }
}

/**
 * Electron main process의 자동 업데이터와 연동되는 상단 배너.
 * - updating: 업데이트 설치 중 (사용자는 계속 작업 가능)
 * - ready: 새 빌드 준비됨 → 클릭 시 앱 재시작
 * - failed: 실패 안내
 * - idle/checking: 표시 안 함
 * Electron 환경이 아니면 window.cockpit이 없어 자동으로 렌더 안 됨.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.cockpit;
    if (!bridge) return;
    bridge.getUpdateStatus().then((s) => setStatus(s));
    const off = bridge.onUpdateStatus((s) => {
      setStatus(s);
      if (s === "failed") bridge.getUpdateError().then(setError);
    });
    return off;
  }, []);

  if (status === "idle" || status === "checking") return null;

  const bgClass =
    status === "ready"
      ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)]/40"
      : status === "failed"
        ? "bg-[var(--color-danger)]/15 border-[var(--color-danger)]/40"
        : "bg-blue-500/15 border-blue-500/40";

  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-1.5 border-b text-xs ${bgClass}`}
    >
      {status === "updating" && (
        <>
          <RefreshCw size={12} className="animate-spin" />
          <span>새 버전 설치 중…</span>
          <span className="text-[var(--color-foreground-dim)]">
            · 작업은 계속 진행하셔도 됩니다
          </span>
        </>
      )}
      {status === "ready" && (
        <>
          <Download size={12} />
          <span>새 버전이 준비됐습니다</span>
          <button
            onClick={() => window.cockpit?.applyUpdate()}
            className="ml-2 px-2 py-0.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90"
          >
            지금 적용 (재시작)
          </button>
        </>
      )}
      {status === "failed" && (
        <>
          <AlertTriangle size={12} />
          <span>업데이트 실패</span>
          {error && (
            <span
              className="text-[var(--color-foreground-dim)] truncate max-w-[400px]"
              title={error}
            >
              · {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}
