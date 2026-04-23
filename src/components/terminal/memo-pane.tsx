"use client";

import { MemoPaneContent } from "./memo-pane-content";

interface Props {
  tabId: string;
  memoId: string;
}

/** 탭 레벨 메모 뷰어 — file-pane 과 동일 패턴. */
export function MemoPane({ memoId }: Props) {
  return <MemoPaneContent memoId={memoId} />;
}
