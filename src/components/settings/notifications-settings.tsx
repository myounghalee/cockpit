"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

type Perm = "granted" | "denied" | "default" | "unsupported";

export function NotificationsSettings() {
  const [perm, setPerm] = useState<Perm>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission as Perm);
  }, []);

  const request = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result as Perm);
    if (result === "granted") {
      try {
        new Notification("Cockpit · 알림이 켜졌습니다", {
          body: "티켓이 완료되면 여기로 알려드려요.",
          icon: "/favicon.svg",
        });
      } catch {
        // noop
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <h2 className="text-sm font-semibold">알림</h2>
      <p className="text-xs text-[var(--color-foreground-muted)]">
        티켓 실행이 끝나면 시스템 알림으로 알려줍니다. 알림을 클릭하면 해당
        티켓 상세 패널이 자동으로 열립니다.
      </p>

      {perm === "unsupported" ? (
        <div className="flex items-center gap-2 text-xs text-[var(--color-warning)]">
          <BellOff size={14} /> 이 브라우저/환경에서는 알림을 지원하지 않습니다.
        </div>
      ) : perm === "granted" ? (
        <div className="flex items-center gap-2 text-xs text-[var(--color-success)]">
          <Bell size={14} /> 알림이 허용되어 있습니다.
        </div>
      ) : perm === "denied" ? (
        <div className="flex flex-col gap-1 text-xs text-[var(--color-danger)]">
          <div className="flex items-center gap-2">
            <BellOff size={14} /> 알림이 차단되어 있습니다.
          </div>
          <p className="text-[10px] text-[var(--color-foreground-dim)]">
            macOS: 시스템 설정 → 알림 센터에서 Cockpit(또는 실행 중인 브라우저)
            알림을 허용해주세요.
          </p>
        </div>
      ) : (
        <button
          onClick={request}
          className="self-start inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-xs hover:bg-[var(--color-accent-hover)]"
        >
          <Bell size={12} /> 알림 허용
        </button>
      )}
    </div>
  );
}
