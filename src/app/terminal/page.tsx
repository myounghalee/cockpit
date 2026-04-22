"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTerminalStore } from "@/store/terminal-store";

/**
 * /terminal 라우트의 페이지 컴포넌트는 "껍데기"이다.
 * 실제 터미널 UI는 AppShell이 렌더하므로, 여기서는 URL 쿼리(?newTabCwd=)만 처리한다.
 * AppShell 쪽이 pathname === "/terminal"일 때 TerminalWorkspace를 노출한다.
 */
export default function TerminalPage() {
  return (
    <Suspense fallback={null}>
      <NewTabFromSearchParam />
    </Suspense>
  );
}

function NewTabFromSearchParam() {
  const sp = useSearchParams();
  const router = useRouter();
  const createTab = useTerminalStore((s) => s.createTab);
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    const cwd = sp.get("newTabCwd");
    if (!cwd) return;
    if (processedRef.current === cwd) return;
    processedRef.current = cwd;
    void createTab({ cwd });
    router.replace("/terminal");
  }, [sp, createTab, router]);

  return null;
}
