"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { PtyWsClient } from "@/lib/ws-client";
import {
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
  Globe,
  FileText,
  StickyNote,
} from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";
import type { TerminalPane as TerminalPaneType } from "@/types/terminal";
import { ProjectPathPicker } from "@/components/projects/project-path-picker";
import { MemoPicker } from "./memo-picker";
import { usePaneDnd } from "./use-pane-dnd";
import { cn } from "@/lib/utils";

// xterm 다크 테마 — globals.css 변수와 맞춤
const XTERM_THEME = {
  background: "#0b0d12",
  foreground: "#e6e8ee",
  cursor: "#4f8cff",
  cursorAccent: "#0b0d12",
  selectionBackground: "#4f8cff55",
  black: "#0b0d12",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#f59e0b",
  blue: "#4f8cff",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e6e8ee",
  brightBlack: "#6a7287",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#fbbf24",
  brightBlue: "#6aa0ff",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f5f7fa",
} as const;

interface TerminalPaneProps {
  pane: TerminalPaneType;
  isActive: boolean;
  onFocus: () => void;
}

export function TerminalPane({ pane, isActive, onFocus }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<PtyWsClient | null>(null);

  const splitPane = useTerminalStore((s) => s.splitPane);
  const closePane = useTerminalStore((s) => s.closePane);
  const fontSize = useTerminalStore((s) => s.terminalFontSize);
  const setPaneStatus = useTerminalStore((s) => s.setPaneStatus);
  const recordPaneNotification = useTerminalStore(
    (s) => s.recordPaneNotification,
  );
  // OSC 알림으로 인한 attention 상태 — 파란 ring 토글용.
  const paneStatus = useTerminalStore((s) => s.paneStatuses[pane.id]);
  const showNotificationRing =
    !!paneStatus?.lastNotification && !paneStatus.acknowledged;
  const dnd = usePaneDnd(pane.id);

  // 생성 시점에만 초기값을 쓰도록 ref로 분리 — 변경은 별도 effect에서 동적으로 반영
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
      fontSize: fontSizeRef.current,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowProposedApi: true,
      macOptionIsMeta: true,
    });

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(webLinks);

    term.open(containerRef.current);
    fit.fit();

    const ws = new PtyWsClient(pane.id);
    // 이 이펙트 내에서만 true → 신규 연결 시 한 번만 initialInput 주입
    let initialInputSent = false;
    const unsubscribe = ws.onMessage((msg) => {
      if (msg.type === "history") {
        // 재연결 시 서버가 축적해둔 출력 스냅샷. 한 번에 써도 xterm이 버퍼링 처리.
        term.write(msg.data);
        // history가 존재한다는 건 이미 pty에서 뭔가 실행됐다는 뜻 → initialInput 주입하지 않음
        initialInputSent = true;
      } else if (msg.type === "output") {
        term.write(msg.data);
        // 첫 output(새 pty의 welcome/prompt)을 받은 시점에 initialInput 주입
        if (!initialInputSent) {
          initialInputSent = true;
          const input = useTerminalStore.getState().consumeInitialInput(pane.id);
          if (input) {
            // Claude Code 부트 타이밍 여유: 추가 200ms 지연
            setTimeout(() => {
              ws.send({ type: "input", data: input });
            }, 200);
          }
        }
      } else if (msg.type === "exit") {
        term.writeln(`\r\n\x1b[33m[process exited with code ${msg.code}]\x1b[0m`);
        // 종료된 pty 는 busy 해제 (tab 상태 초기화)
        setPaneStatus(pane.id, false, null, false);
      } else if (msg.type === "error") {
        term.writeln(`\r\n\x1b[31m[error: ${msg.message}]\x1b[0m`);
      } else if (msg.type === "status") {
        // 서버가 1초 주기로 자식 프로세스 감지 → 이 pane 의 실행 상태
        setPaneStatus(pane.id, msg.busy, msg.command, msg.awaitingInput);
      } else if (msg.type === "notification") {
        // OSC 9/99/777 — Claude Code 등 에이전트 attention 시그널.
        recordPaneNotification(pane.id, msg.title, msg.body);
      }
    });
    ws.connect();

    // Shift+Enter → 줄바꿈 전송 (Claude CLI 멀티라인 입력용)
    // Esc → xterm blur (shell 에 전달 안 함) — 외부 포커스로 빠져나오기
    // 한글 IME 조합 중(isComposing)에는 무시하여 이중 입력 방지
    term.attachCustomKeyEventHandler((e) => {
      if (e.isComposing) return true;
      if (e.key === "Enter" && e.shiftKey) {
        if (e.type === "keydown") {
          ws.send({ type: "input", data: "\n" });
        }
        return false;
      }
      if (e.key === "Escape" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.type === "keydown") {
          // blur하면 xterm textarea에서 포커스 빠져나옴 → 외부 window keydown 이
          // 다시 받을 수 있게 됨. shell 로 Esc 전달은 차단(대부분 불필요).
          term.blur();
          // 포커스를 body 로 명시적 이동 (아니면 xterm 컨테이너에 남을 수 있음)
          requestAnimationFrame(() => {
            (document.activeElement as HTMLElement | null)?.blur?.();
            document.body.focus?.();
          });
        }
        return false;
      }
      return true;
    });

    const onData = term.onData((data) => {
      ws.send({ type: "input", data });
    });

    // 초기 사이즈 전송.
    // fit() 직후 cols/rows 를 읽지만 xterm 렌더가 완전히 반영되었다는 보장은 없어
    // rAF 다음 프레임에 한 번 더 측정해 전송하는 편이 안전.
    let lastCols = -1;
    let lastRows = -1;
    let resizeRafId: number | null = null;
    const sendResize = () => {
      if (resizeRafId != null) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        try {
          fit.fit();
        } catch {
          return;
        }
        const { cols, rows } = term;
        // cols/rows 가 0 이면 DOM 이 아직 layout 안 된 상태 → 스킵
        if (!cols || !rows) return;
        // 같은 값이면 메시지 안 보냄 (PTY 재resize race 방지)
        if (cols === lastCols && rows === lastRows) return;
        lastCols = cols;
        lastRows = rows;
        ws.send({ type: "resize", cols, rows });
      });
    };

    // 초기 한 번
    sendResize();

    // ResizeObserver — 연속 콜 debounce 로 병합 (~50ms)
    let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        resizeDebounceTimer = null;
        sendResize();
      }, 50);
    });
    resizeObserver.observe(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;
    wsRef.current = ws;

    return () => {
      resizeObserver.disconnect();
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      if (resizeRafId != null) cancelAnimationFrame(resizeRafId);
      onData.dispose();
      unsubscribe();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [pane.id]);

  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive]);

  // 외부 (terminal-workspace의 Enter 단축키 등) 에서 특정 pane 으로 포커스 요청
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { paneId?: string } | undefined;
      if (detail?.paneId === pane.id && termRef.current) {
        termRef.current.focus();
      }
    };
    window.addEventListener("cockpit-focus-pane", handler);
    return () => window.removeEventListener("cockpit-focus-pane", handler);
  }, [pane.id]);

  // 설정에서 폰트 크기 바뀌면 실시간 반영 + fit으로 열/행 재계산
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    fit?.fit();
  }, [fontSize]);

  return (
    <div
      data-pane-id={pane.id}
      className={cn(
        "relative flex flex-col h-full min-h-0 bg-[var(--color-background)] border border-transparent group",
        dnd.isDragOver && "border-[var(--color-accent)]",
        // OSC 알림 ring — 에이전트 attention. 사용자가 활성화/포커스 시
        // setActiveTab → acknowledged=true 로 자동 해제.
        showNotificationRing &&
          "ring-2 ring-[var(--color-accent)] ring-inset",
      )}
      title={
        showNotificationRing && paneStatus?.lastNotification
          ? [paneStatus.lastNotification.title, paneStatus.lastNotification.body]
              .filter(Boolean)
              .join(" — ")
          : undefined
      }
      onMouseDown={onFocus}
      onClick={onFocus}
      {...dnd.rootProps}
    >
      {/* 패인 헤더 */}
      <div
        {...dnd.handleProps}
        className="flex items-center justify-between h-7 px-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] text-xs text-[var(--color-foreground-muted)] cursor-grab active:cursor-grabbing"
      >
        <span className="truncate">{pane.title}</span>
        <div
          className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <ProjectPathPicker
            onSelect={(cwd) =>
              splitPane(pane.id, "horizontal", cwd ? { cwd } : undefined)
            }
            defaultLabel="기본 (현재 패널 cwd)"
            defaultDescription={pane.cwd}
            align="end"
            side="bottom"
            trigger={
              <button
                className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
                title="오른쪽으로 분할 (클릭으로 프로젝트 선택)"
                aria-label="오른쪽으로 분할"
              >
                <SplitSquareHorizontal size={12} />
              </button>
            }
          />
          <ProjectPathPicker
            onSelect={(cwd) =>
              splitPane(pane.id, "vertical", cwd ? { cwd } : undefined)
            }
            defaultLabel="기본 (현재 패널 cwd)"
            defaultDescription={pane.cwd}
            align="end"
            side="bottom"
            trigger={
              <button
                className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
                title="아래로 분할 (클릭으로 프로젝트 선택)"
                aria-label="아래로 분할"
              >
                <SplitSquareVertical size={12} />
              </button>
            }
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              splitPane(pane.id, "horizontal", { type: "browser" });
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
            title="오른쪽에 브라우저 분할"
            aria-label="오른쪽에 브라우저 분할"
          >
            <Globe size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              splitPane(pane.id, "horizontal", { type: "file" });
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
            title="오른쪽에 파일 뷰어 분할"
            aria-label="오른쪽에 파일 뷰어 분할"
          >
            <FileText size={12} />
          </button>
          <MemoPicker
            onSelect={(memo) =>
              splitPane(pane.id, "horizontal", {
                type: "memo",
                memoId: memo.id,
                title: memo.title || "메모",
              })
            }
            trigger={
              <button
                className="p-1 rounded hover:bg-[var(--color-surface-hover)]"
                title="오른쪽에 메모 뷰어 분할"
                aria-label="오른쪽에 메모 뷰어 분할"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <StickyNote size={12} />
              </button>
            }
          />

          <button
            onClick={(e) => {
              e.stopPropagation();
              closePane(pane.id);
            }}
            className="p-1 rounded hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)]"
            title="패인 닫기"
            aria-label="패인 닫기"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* xterm 컨테이너 */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
