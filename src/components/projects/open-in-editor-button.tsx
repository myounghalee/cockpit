"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";
import { cn } from "@/lib/utils";

interface Props {
  /** 열 대상 경로 (프로젝트 루트 등) */
  path: string;
  className?: string;
  iconSize?: number;
  label?: string;
}

/**
 * Settings에서 선택한 기본 에디터로 경로를 여는 공용 버튼.
 * 프로젝트 카드, 칸반 헤더, 파일 뷰어 등 어디서나 재사용.
 */
export function OpenInEditorButton({
  path,
  className,
  iconSize = 13,
  label,
}: Props) {
  const editor = useTerminalStore((s) => s.preferredEditor);
  const customCommand = useTerminalStore((s) => s.customEditorCommand);
  const [busy, setBusy] = useState(false);

  const open = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/system/open-editor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, editor, customCommand }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
    } catch (err) {
      alert(`에디터 실행 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1 text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] disabled:opacity-40",
        className,
      )}
      title={`에디터로 열기 (${editor})`}
      aria-label="에디터로 열기"
    >
      <ExternalLink size={iconSize} />
      {label && <span>{label}</span>}
    </button>
  );
}
