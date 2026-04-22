"use client";

import { FilePaneContent } from "./file-pane-content";

interface Props {
  tabId: string;
  initialPath?: string;
}

/** 탭 레벨 파일 뷰어 */
export function FilePane({ tabId, initialPath }: Props) {
  return <FilePaneContent paneId={tabId} initialPath={initialPath ?? ""} />;
}
