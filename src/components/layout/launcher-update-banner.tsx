"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isNewerVersion, parseVersionFromUserAgent } from "@/lib/app-version";

/**
 * "런처(.app) 자체가 뒤처졌다"는 안내 배너.
 *
 * 자동 업데이트는 `~/.cockpit-app`(서버 소스)만 갱신하고 /Applications 의
 * 런처는 건드리지 않는다. 그래서 electron/main.ts 변경(업데이터·창 관리 등)은
 * 새 DMG 를 설치해야만 반영된다 — 그런데 사용자는 그 사실을 알 방법이 없었다.
 *
 * 이 컴포넌트는 **서버 소스 쪽**에 있으므로 자동 업데이트만으로 기존 사용자
 * 에게도 전달된다. 런처 버전은 두 경로로 알아낸다:
 *   1. window.cockpit.getAppVersion()  — 신버전 런처(권장)
 *   2. User-Agent 의 `Cockpit/x.y.z`   — 구버전 런처 폴백
 * 둘 다 실패하면 아무것도 표시하지 않는다. 확실하지 않을 때 잘못된 안내를
 * 띄우는 것보다 침묵이 낫다.
 */

const DISMISS_KEY = "cockpit-launcher-update-dismissed";

export function LauncherUpdateBanner() {
  const [current, setCurrent] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true); // 판단 전엔 숨김

  // 1) 런처 버전 확보
  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const bridge = window.cockpit;
      // Electron 이 아니면(웹 브라우저) 애초에 런처가 없다 → 표시 안 함
      if (!bridge) return null;
      try {
        const v = await bridge.getAppVersion?.();
        if (v) return v;
      } catch {
        // 구버전 런처엔 핸들러가 없어 invoke 가 reject 된다 → 폴백으로
      }
      return parseVersionFromUserAgent(navigator.userAgent);
    };

    resolve().then((v) => {
      if (!cancelled) setCurrent(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 최신 릴리즈 조회 (서버가 1시간 캐시)
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    fetch("/api/latest-release")
      .then((r) => r.json())
      .then((d: { version?: string | null; htmlUrl?: string | null }) => {
        if (cancelled) return;
        setLatest(d.version ?? null);
        setUrl(d.htmlUrl ?? null);
      })
      .catch(() => {
        // 오프라인 등 — 조용히 무시
      });
    return () => {
      cancelled = true;
    };
  }, [current]);

  // 3) 표시 여부 — 같은 버전을 이미 닫았으면 다시 띄우지 않는다
  useEffect(() => {
    if (!current || !latest) return;
    if (!isNewerVersion(latest, current)) {
      setDismissed(true);
      return;
    }
    const seen =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(DISMISS_KEY)
        : null;
    setDismissed(seen === latest);
  }, [current, latest]);

  if (dismissed || !current || !latest) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, latest);
    } catch {
      // private mode 등 — 저장 실패해도 이번 세션은 닫힌다
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs border-b bg-[var(--color-warning)]/15 border-[var(--color-warning)]/40 text-[var(--color-foreground)]">
      <Download size={14} className="flex-shrink-0 text-[var(--color-warning)]" />
      <span className="flex-1 min-w-0">
        새 버전 <strong>v{latest}</strong> 이 나왔습니다 (현재 v{current}).
        <span className="text-[var(--color-foreground-muted)]">
          {" "}
          앱 자동 업데이트로는 갱신되지 않는 부분이 있어 새로 설치해야 합니다.
        </span>
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-2 py-1 rounded bg-[var(--color-warning)]/25 hover:bg-[var(--color-warning)]/40 font-medium"
        >
          다운로드
        </a>
      )}
      <button
        onClick={close}
        className="flex-shrink-0 p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]"
        aria-label="닫기"
        title="이 버전은 다시 알리지 않음"
      >
        <X size={12} />
      </button>
    </div>
  );
}
