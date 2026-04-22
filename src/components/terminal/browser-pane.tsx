"use client";

import { BrowserContent } from "./browser-pane-content";

interface Props {
  tabId: string;
  initialUrl?: string;
}

/** 탭 레벨 브라우저 — BrowserContent 래핑 */
export function BrowserPane({ tabId, initialUrl }: Props) {
  return <BrowserContent paneId={tabId} initialUrl={initialUrl ?? ""} />;
}
