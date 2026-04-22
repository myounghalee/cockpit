"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  ExternalLink,
  AlertTriangle,
  Wrench,
  Clock,
  X as XIcon,
} from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";

/** Electron 환경 감지 — webview 태그 사용 가능 여부 */
const IS_ELECTRON =
  typeof navigator !== "undefined" &&
  /Electron/i.test(navigator.userAgent);

interface Props {
  /** 탭 ID 또는 분할 pane ID */
  paneId: string;
  initialUrl: string;
}

/** URL 정규화 — 프로토콜 없으면 https 붙이고, 검색어처럼 보이면 구글 검색 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return "https://" + trimmed;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

/** 공용 브라우저 본체 — 탭/분할 panes 양쪽에서 사용 */
export function BrowserContent({ paneId, initialUrl }: Props) {
  const setBrowserUrl = useTerminalStore((s) => s.setBrowserUrl);
  const addRecentUrl = useTerminalStore((s) => s.addRecentUrl);
  const recentUrls = useTerminalStore((s) => s.recentUrls);
  const [input, setInput] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [blocked, setBlocked] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  // Electron webview element (imperative)
  const webviewRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(initialUrl);
    setCurrentUrl(initialUrl);
  }, [initialUrl]);

  // Electron에서 webview 엘리먼트 생성/업데이트
  useEffect(() => {
    if (!IS_ELECTRON || !webviewContainerRef.current) return;
    if (!currentUrl) {
      // URL 없으면 webview 제거
      if (webviewRef.current) {
        webviewRef.current.remove();
        webviewRef.current = null;
      }
      return;
    }

    if (!webviewRef.current) {
      const wv = document.createElement("webview");
      wv.setAttribute("src", currentUrl);
      wv.setAttribute("allowpopups", "true");
      const el = wv as HTMLElement;
      // 컨테이너에 absolute로 꽉 채움 → 스크롤 없음
      el.style.position = "absolute";
      el.style.top = "0";
      el.style.left = "0";
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.display = "flex";
      webviewContainerRef.current.appendChild(wv);
      webviewRef.current = wv;
    } else {
      // URL 바뀌면 src 갱신
      const current = webviewRef.current.getAttribute("src");
      if (current !== currentUrl) {
        webviewRef.current.setAttribute("src", currentUrl);
      }
    }
  }, [currentUrl]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (webviewRef.current) {
        webviewRef.current.remove();
        webviewRef.current = null;
      }
    };
  }, []);

  const go = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setCurrentUrl(url);
    setBrowserUrl(paneId, url);
    setInput(url);
    setBlocked(false);
    setShowRecent(false);
    addRecentUrl(url);
  };

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showRecent) return;
    const onDown = (e: MouseEvent) => {
      if (
        recentBoxRef.current &&
        !recentBoxRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowRecent(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showRecent]);

  const reload = () => {
    if (IS_ELECTRON && webviewRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (webviewRef.current as any).reload?.();
      return;
    }
    if (iframeRef.current) {
      const src = iframeRef.current.src;
      iframeRef.current.src = "about:blank";
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.src = src;
      });
    }
  };

  const goBack = () => {
    if (IS_ELECTRON && webviewRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wv = webviewRef.current as any;
      if (wv.canGoBack?.()) wv.goBack();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {
      // cross-origin
    }
  };

  const goForward = () => {
    if (IS_ELECTRON && webviewRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wv = webviewRef.current as any;
      if (wv.canGoForward?.()) wv.goForward();
      return;
    }
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {
      // cross-origin
    }
  };

  const openExternal = () => {
    if (!currentUrl) return;
    window.open(currentUrl, "_blank", "noopener");
  };

  const openDevTools = () => {
    if (!IS_ELECTRON || !webviewRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wv = webviewRef.current as any;
    try {
      if (wv.isDevToolsOpened?.()) {
        wv.closeDevTools();
      } else {
        wv.openDevTools();
      }
    } catch {
      // ignore
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    go(input);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-background)]">
      {/* 주소창 */}
      <div className="relative flex items-center gap-1 h-9 px-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          onClick={goBack}
          className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
          title="뒤로"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={goForward}
          className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
          title="앞으로"
        >
          <ArrowRight size={14} />
        </button>
        <button
          onClick={reload}
          className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
          title="새로고침"
        >
          <RotateCw size={14} />
        </button>
        <form onSubmit={onSubmit} className="flex-1 flex items-center gap-1">
          <div className="flex-1 flex items-center gap-1 px-2 h-7 rounded bg-[var(--color-background)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)]">
            <Globe size={12} className="text-[var(--color-foreground-dim)]" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => recentUrls.length > 0 && setShowRecent(true)}
              placeholder="URL 입력 또는 검색어"
              className="flex-1 bg-transparent text-xs text-[var(--color-foreground)] outline-none"
            />
            {recentUrls.length > 0 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowRecent((v) => !v)}
                className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
                title="최근 URL"
                aria-label="최근 URL"
              >
                <Clock size={12} />
              </button>
            )}
          </div>
        </form>

        {showRecent && recentUrls.length > 0 && (
          <div
            ref={recentBoxRef}
            className="absolute left-14 right-14 top-9 z-30 mt-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden"
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-foreground-dim)]">
                최근 URL ({recentUrls.length})
              </span>
              <button
                type="button"
                onClick={() => setShowRecent(false)}
                className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
                aria-label="닫기"
              >
                <XIcon size={11} />
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {recentUrls.map((u) => {
                let host = u;
                let rest = "";
                try {
                  const parsed = new URL(u);
                  host = parsed.host;
                  rest = parsed.pathname + parsed.search;
                } catch {
                  // 검색 쿼리 등 URL이 아니면 그대로 표시
                }
                return (
                  <li key={u}>
                    <button
                      type="button"
                      onClick={() => go(u)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-surface-hover)]"
                    >
                      <Globe
                        size={11}
                        className="text-[var(--color-foreground-dim)] shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs text-[var(--color-foreground)] truncate">
                          {host}
                        </span>
                        {rest && rest !== "/" && (
                          <span className="block text-[10px] text-[var(--color-foreground-dim)] font-mono truncate">
                            {rest}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <button
          onClick={openExternal}
          className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
          title="기본 브라우저로 열기"
        >
          <ExternalLink size={14} />
        </button>
        {IS_ELECTRON && (
          <button
            onClick={openDevTools}
            className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
            title="개발자 도구 (토글)"
          >
            <Wrench size={14} />
          </button>
        )}
      </div>

      {/* 본체 — Electron은 <webview>, 웹은 iframe */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* 메인 웹페이지 영역 */}
        <div className="relative bg-white flex-1 min-h-0">
          {currentUrl ? (
            IS_ELECTRON ? (
              <div
                ref={webviewContainerRef}
                className="absolute inset-0 overflow-hidden"
              />
            ) : (
              <>
                <iframe
                  ref={iframeRef}
                  src={currentUrl}
                  className="w-full h-full border-0"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                  onError={() => setBlocked(true)}
                />
                {blocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-background)]/95 text-center p-6">
                    <div>
                      <AlertTriangle
                        size={32}
                        className="mx-auto text-[var(--color-warning)] mb-2"
                      />
                      <p className="text-sm text-[var(--color-foreground-muted)] mb-3">
                        이 사이트는 iframe 임베드를 차단합니다.
                      </p>
                      <button
                        onClick={openExternal}
                        className="px-3 py-1.5 text-xs bg-[var(--color-accent)] text-white rounded inline-flex items-center gap-1"
                      >
                        <ExternalLink size={11} /> 기본 브라우저로 열기
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-foreground-muted)] bg-[var(--color-background)]">
              주소창에 URL을 입력하세요.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
