import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CreateTerminalResponse,
  SplitDirection,
  SplitNode,
  TerminalPane,
  TerminalTab,
} from "@/types/terminal";
import { useActiveProjectStore } from "./active-project-store";

/**
 * 터미널 워크스페이스 상태.
 * - tabs 배열에 각 탭, 각 탭은 재귀적 SplitNode 트리를 가짐.
 * - persist 미들웨어로 tabs/activeTabId만 localStorage에 저장.
 * - 앱 마운트 시 syncWithServer()로 서버 pty 목록과 대조하여 stale한 pane/탭을 정리.
 */

export interface PaneStatus {
  busy: boolean;
  command: string | null;
  /**
   * busy + 최근 출력 없음 → 사용자 입력 대기 추정.
   * 깜빡임 트리거 (첫 번째 조건).
   */
  awaitingInput: boolean;
  /**
   * busy → idle 전환 시점 (ms). 깜빡임 트리거 (두 번째 조건 — 방금 완료).
   * 탭 클릭 시 null 로 초기화되어 깜빡임 종료.
   */
  completedAt: number | null;
  /**
   * 사용자가 "이 탭을 봤음" 플래그. true 면 깜빡임 중지.
   * - setActiveTab 시 true 로 세팅 (dismiss)
   * - 새로운 상태 전환(새 작업 시작, 새 응답 대기)이 감지되면 다시 false 로 리셋
   *   → 다음 알림은 다시 깜빡여서 주의 환기
   */
  acknowledged: boolean;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  hydrated: boolean; // persist 복원 완료 플래그
  /** 각 terminal pane 의 현재 실행 상태 (서버 폴링 기반). persist 안 됨. */
  paneStatuses: Record<string, PaneStatus>;
  setPaneStatus: (
    paneId: string,
    busy: boolean,
    command: string | null,
    awaitingInput: boolean,
  ) => void;
  /** 파일 뷰어에서 성공적으로 열었던 최근 경로들 (최신 먼저, 최대 10개) */
  recentFiles: string[];
  /** 브라우저에서 방문했던 최근 URL들 (최신 먼저, 최대 10개) */
  recentUrls: string[];
  /** UI 선호도 — 각 탭별 본문 폰트 크기 (px) */
  terminalFontSize: number;
  markdownFontSize: number;
  /** 외부 에디터로 열기 기본값 */
  preferredEditor: string; // "vscode" | "cursor" | "webstorm" | "idea" | "sublime" | "custom"
  customEditorCommand: string;

  createTab: (opts?: {
    cwd?: string;
    projectId?: string;
    initialInput?: string;
    tabName?: string;
    ticketId?: string;
  }) => Promise<string>;
  /** 패인의 initialInput을 1회 사용 후 클리어. TerminalPane이 호출. */
  consumeInitialInput: (paneId: string) => string | undefined;
  closeTab: (tabId: string) => Promise<void>;
  renameTab: (tabId: string, name: string) => void;
  setActiveTab: (tabId: string) => void;

  /** 브라우저 탭 생성 (URL은 선택) */
  createBrowserTab: (url?: string, tabName?: string) => string;
  /** 브라우저 URL 갱신 (탭 또는 분할 내 브라우저 pane) */
  setBrowserUrl: (id: string, url: string) => void;

  /** 파일 뷰어 탭 생성 */
  createFileTab: (filePath?: string, tabName?: string) => string;
  /** 파일 뷰어 경로 갱신 */
  setFilePath: (id: string, filePath: string) => void;
  /** 최근 파일 히스토리에 경로 추가 (파일 로드 성공 후 호출) */
  addRecentFile: (filePath: string) => void;
  /** 최근 URL 히스토리에 URL 추가 (브라우저 이동 시 호출) */
  addRecentUrl: (url: string) => void;
  /** 터미널 폰트 크기 설정 */
  setTerminalFontSize: (px: number) => void;
  /** 마크다운 뷰 폰트 크기 설정 */
  setMarkdownFontSize: (px: number) => void;
  /** 선호 에디터 설정 */
  setPreferredEditor: (editor: string) => void;
  /** 커스텀 에디터 명령 설정 */
  setCustomEditorCommand: (cmd: string) => void;

  /** 탭 복제 — 동일한 type/url/cwd로 새 탭 생성 */
  duplicateTab: (tabId: string) => Promise<string | null>;

  /** 탭 순서 변경 — fromIndex의 탭을 toIndex 위치로 이동 */
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  /** 같은 부모 split 내에서 pane 순서 변경 */
  reorderPanes: (sourcePaneId: string, targetPaneId: string) => void;

  splitPane: (
    paneId: string,
    direction: SplitDirection,
    opts?: {
      cwd?: string;
      type?: "terminal" | "browser" | "file";
      url?: string;
      filePath?: string;
    },
  ) => Promise<void>;
  closePane: (paneId: string) => Promise<void>;

  /**
   * 현재 활성 탭의 가장 오른쪽 pane 기준으로 horizontal split을 추가해 터미널 생성.
   * cwd 미지정 시 active project path 사용. 활성 탭이 터미널 탭이 아니면 no-op.
   * ⌘⇧T 단축키용.
   */
  splitRightmostInActiveTab: (cwd?: string) => Promise<void>;

  syncWithServer: () => Promise<void>;
}

/** 분할 트리에서 가장 오른쪽/아래 leaf pane 의 id 를 찾는다. */
function rightmostLeafPaneId(node: SplitNode): string {
  if (node.type === "leaf") return node.pane.id;
  return rightmostLeafPaneId(node.children[node.children.length - 1]);
}

/** 분할 트리의 첫 번째 leaf pane 의 id — "Enter 로 첫 터미널 focus" 용 */
export function firstLeafPaneId(node: SplitNode): string {
  if (node.type === "leaf") return node.pane.id;
  return firstLeafPaneId(node.children[0]);
}

async function createPty(opts?: {
  cwd?: string;
  projectId?: string;
}): Promise<CreateTerminalResponse> {
  const body: { cwd?: string; projectId?: string } = {};
  if (opts?.cwd) body.cwd = opts.cwd;
  else if (opts?.projectId) body.projectId = opts.projectId;
  else {
    const active = useActiveProjectStore.getState();
    if (active.activeProjectPath) body.cwd = active.activeProjectPath;
    else if (active.activeProjectId) body.projectId = active.activeProjectId;
  }

  const res = await fetch("/api/terminals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create terminal: ${res.status}`);
  return (await res.json()) as CreateTerminalResponse;
}

async function deletePty(id: string): Promise<void> {
  try {
    await fetch(`/api/terminals/${id}`, { method: "DELETE" });
  } catch {
    // ignore
  }
}

function findAllPanes(node: SplitNode): TerminalPane[] {
  if (node.type === "leaf") return [node.pane];
  return node.children.flatMap(findAllPanes);
}

// terminal-workspace 의 ⌘⌥←/→ 단축키가 트리 순회 없이 쓸 수 있도록 공개.
export function flattenPanes(node: SplitNode): TerminalPane[] {
  return findAllPanes(node);
}

function replaceLeaf(
  node: SplitNode,
  targetPaneId: string,
  replacement: SplitNode,
): SplitNode {
  if (node.type === "leaf") {
    return node.pane.id === targetPaneId ? replacement : node;
  }
  return {
    ...node,
    children: node.children.map((c) => replaceLeaf(c, targetPaneId, replacement)),
  };
}

function removeLeaf(node: SplitNode, targetPaneId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.pane.id === targetPaneId ? null : node;
  }
  const children = node.children
    .map((c) => removeLeaf(c, targetPaneId))
    .filter((c): c is SplitNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

/**
 * 죽은 터미널 pane을 같은 cwd로 새 PTY를 만들어 교체.
 * browser/file pane은 그대로. 모두 제거되면 null.
 */
async function recreateDeadPanes(
  node: SplitNode,
  alive: Set<string>,
): Promise<SplitNode | null> {
  if (node.type === "leaf") {
    const { pane } = node;
    if (pane.type === "browser" || pane.type === "file") {
      return node;
    }
    // 터미널 pane
    if (alive.has(pane.id)) return node;
    // 죽었으면 같은 cwd로 재생성 (실패 시 최대 3번 재시도)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await createPty({ cwd: pane.cwd });
        return {
          type: "leaf",
          pane: {
            id: res.id,
            cwd: res.cwd,
            title: pane.title || shortCwd(res.cwd),
          },
        };
      } catch (err) {
        console.warn(
          `[cockpit] PTY 재생성 실패 (attempt ${attempt + 1}, pane=${pane.id}):`,
          err,
        );
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
    // 3번 다 실패해도 pane은 유지 (탭 레이아웃 보존)
    console.error(
      `[cockpit] PTY 재생성 최종 실패 — pane 유지 (id=${pane.id})`,
    );
    return node;
  }
  const children = await Promise.all(
    node.children.map((c) => recreateDeadPanes(c, alive)),
  );
  const valid = children.filter((c): c is SplitNode => c !== null);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return { ...node, children: valid };
}

/** split tree에서 alive set에 없는 leaf를 제거한 새 트리를 반환. 모두 제거되면 null. */
function prunePanes(node: SplitNode, alive: Set<string>): SplitNode | null {
  if (node.type === "leaf") {
    return alive.has(node.pane.id) ? node : null;
  }
  const children = node.children
    .map((c) => prunePanes(c, alive))
    .filter((c): c is SplitNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}

/**
 * 같은 방향의 부모 split이 있으면 자식으로 추가 (플랫 3+분할).
 * 없으면 새 split 노드로 교체 (기존 동작).
 */
function addToSplitOrReplace(
  node: SplitNode,
  targetPaneId: string,
  direction: SplitDirection,
  newPane: TerminalPane,
): SplitNode {
  if (node.type === "leaf") {
    if (node.pane.id === targetPaneId) {
      // 부모가 없으니 새 split 생성
      return {
        type: "split",
        direction,
        children: [node, { type: "leaf", pane: newPane }],
      };
    }
    return node;
  }

  // split 노드: 자식 중에 대상 pane이 직접 있고 방향이 같으면 → 자식 추가
  if (node.direction === direction) {
    const idx = node.children.findIndex(
      (c) => c.type === "leaf" && c.pane.id === targetPaneId,
    );
    if (idx >= 0) {
      const newChildren = [...node.children];
      newChildren.splice(idx + 1, 0, { type: "leaf", pane: newPane });
      return { ...node, children: newChildren };
    }
  }

  // 재귀적으로 자식 탐색
  return {
    ...node,
    children: node.children.map((c) =>
      addToSplitOrReplace(c, targetPaneId, direction, newPane),
    ),
  };
}

/** split 트리 내의 특정 browser pane의 url 갱신 */
function updateBrowserPaneUrl(
  node: SplitNode,
  paneId: string,
  url: string,
): SplitNode {
  if (node.type === "leaf") {
    if (node.pane.id === paneId && node.pane.type === "browser") {
      return { type: "leaf", pane: { ...node.pane, url } };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) => updateBrowserPaneUrl(c, paneId, url)),
  };
}

/** split 트리 내의 file pane 경로 갱신 */
function updateFilePanePath(
  node: SplitNode,
  paneId: string,
  filePath: string,
): SplitNode {
  if (node.type === "leaf") {
    if (node.pane.id === paneId && node.pane.type === "file") {
      return { type: "leaf", pane: { ...node.pane, filePath } };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) => updateFilePanePath(c, paneId, filePath)),
  };
}

/**
 * 같은 부모 split 내에 두 pane이 모두 direct child이면 순서 swap.
 * 다른 split에 있으면 변경 없음.
 */
function reorderWithinSameSplit(
  node: SplitNode,
  sourceId: string,
  targetId: string,
): SplitNode {
  if (node.type === "leaf") return node;

  // 현재 노드의 직접 자식 중 두 pane을 모두 포함하는지 확인
  const childIndex = (cid: string): number =>
    node.children.findIndex(
      (c) => c.type === "leaf" && c.pane.id === cid,
    );
  const sIdx = childIndex(sourceId);
  const tIdx = childIndex(targetId);

  if (sIdx >= 0 && tIdx >= 0 && sIdx !== tIdx) {
    const newChildren = [...node.children];
    const [moved] = newChildren.splice(sIdx, 1);
    newChildren.splice(tIdx, 0, moved);
    return { ...node, children: newChildren };
  }

  // 자식 중 한쪽만 leaf이거나 더 깊이 있는 경우 → 재귀
  return {
    ...node,
    children: node.children.map((c) =>
      reorderWithinSameSplit(c, sourceId, targetId),
    ),
  };
}

/**
 * 분할 트리를 재귀적으로 복제 — 각 pane은 새로 생성 (PTY는 새로 spawn, browser/file은 메타만 복사).
 * 터미널 히스토리는 복제되지 않고, 동일한 cwd에서 새 세션 시작.
 */
async function cloneSplitNode(node: SplitNode): Promise<SplitNode | null> {
  if (node.type === "leaf") {
    const { pane } = node;
    if (pane.type === "browser") {
      const newPane: TerminalPane = {
        id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cwd: pane.cwd,
        title: pane.title,
        type: "browser",
        url: pane.url ?? "",
      };
      return { type: "leaf", pane: newPane };
    }
    if (pane.type === "file") {
      const newPane: TerminalPane = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cwd: pane.cwd,
        title: pane.title,
        type: "file",
        filePath: pane.filePath ?? "",
      };
      return { type: "leaf", pane: newPane };
    }
    // 터미널 pane — 새 PTY 생성
    try {
      const res = await createPty({ cwd: pane.cwd });
      const newPane: TerminalPane = {
        id: res.id,
        cwd: res.cwd,
        title: shortCwd(res.cwd),
      };
      return { type: "leaf", pane: newPane };
    } catch {
      return null;
    }
  }
  // split — 자식들 재귀 복제
  const children = await Promise.all(
    node.children.map((c) => cloneSplitNode(c)),
  );
  const validChildren = children.filter((c): c is SplitNode => c !== null);
  if (validChildren.length === 0) return null;
  if (validChildren.length === 1) return validChildren[0];
  return { ...node, children: validChildren };
}

function shortCwd(cwd: string): string {
  const base = cwd.split("/").filter(Boolean).pop() ?? "/";
  return base || "~";
}

/**
 * split tree에서 특정 paneId의 initialInput을 null로 교체하고 캡쳐해 콜백에 전달.
 */
function stripInitialInput(
  node: SplitNode,
  targetPaneId: string,
  capture: (input: string | undefined) => void,
): SplitNode {
  if (node.type === "leaf") {
    if (node.pane.id === targetPaneId && node.pane.initialInput) {
      capture(node.pane.initialInput);
      return {
        type: "leaf",
        pane: { ...node.pane, initialInput: null },
      };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) =>
      stripInitialInput(c, targetPaneId, capture),
    ),
  };
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      hydrated: false,
      paneStatuses: {},
      recentFiles: [],
      recentUrls: [],
      terminalFontSize: 13,
      markdownFontSize: 14,
      preferredEditor: "vscode",
      customEditorCommand: "",

      setPaneStatus: (paneId, busy, command, awaitingInput) => {
        set((s) => {
          const prev = s.paneStatuses[paneId];
          // ── 전환 이벤트 ──
          // justCompleted: 작업 종료 (명확한 알림 대상)
          const justCompleted = !!prev?.busy && !busy;
          // startedNewBusyCycle: 새 작업 시작 (acknowledged 리셋 트리거로 활용)
          const startedNewBusyCycle = !prev?.busy && busy;
          // isFirstContact: 이 pane 에 대한 최초 status
          const isFirstContact = !prev;

          const completedAt = justCompleted
            ? Date.now()
            : busy
              ? null
              : (prev?.completedAt ?? null);

          // acknowledged 리셋 정책:
          //   (1) 방금 완료     → 깜빡임 시작 (명확한 신호)
          //   (2) 새 busy cycle → 다음 awaiting 때 깜빡임 가능하도록 미리 리셋
          //   (3) 첫 접촉인데 이미 awaitingInput 이면 → 깜빡임 시작
          //   (그 외)           → prev 유지
          // 중요: awaiting 가 false↔true 토글(커서 깜빡임 등으로 lastOutputAt 변동)만
          //       으로는 리셋하지 않음 → "한 번 보면 같은 작업 내내 조용"
          let acknowledged: boolean;
          if (justCompleted || startedNewBusyCycle) {
            acknowledged = false;
          } else if (isFirstContact && awaitingInput) {
            acknowledged = false;
          } else {
            acknowledged = prev?.acknowledged ?? true;
          }

          return {
            paneStatuses: {
              ...s.paneStatuses,
              [paneId]: {
                busy,
                command,
                awaitingInput,
                completedAt,
                acknowledged,
              },
            },
          };
        });
      },

      createTab: async (opts) => {
        const res = await createPty(opts);
        const pane: TerminalPane = {
          id: res.id,
          cwd: res.cwd,
          title: shortCwd(res.cwd),
          initialInput: opts?.initialInput ?? null,
        };
        const tabId = `tab-${res.id}`;
        const tab: TerminalTab = {
          id: tabId,
          name: opts?.tabName ?? shortCwd(res.cwd),
          root: { type: "leaf", pane },
          ticketId: opts?.ticketId ?? null,
        };
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: tabId,
        }));
        return tabId;
      },

      consumeInitialInput: (paneId) => {
        let captured: string | undefined;
        set((s) => ({
          tabs: s.tabs.map((t) => ({
            ...t,
            root: stripInitialInput(t.root, paneId, (input) => {
              captured = input;
            }),
          })),
        }));
        return captured;
      },

      closeTab: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        if (!tab) return;
        // 브라우저/파일 탭은 pty 없음 → 그냥 state에서만 제거
        if (tab.type === "browser" || tab.type === "file") {
          set((s) => {
            const remaining = s.tabs.filter((t) => t.id !== tabId);
            const nextActive =
              s.activeTabId === tabId
                ? (remaining[0]?.id ?? null)
                : s.activeTabId;
            return { tabs: remaining, activeTabId: nextActive };
          });
          return;
        }
        const panes = findAllPanes(tab.root);
        await Promise.all(panes.map((p) => deletePty(p.id)));

        // 주의: 예전엔 티켓 연결 탭이 닫히면 자동으로 status=review로 바꿨지만,
        // 지금은 백그라운드 runner가 실행 주체이므로 탭 닫기와 작업 상태는 분리한다.
        // ("Claude 열기"로 대화형 검토만 하고 탭을 닫아도 runner는 계속 돈다)

        set((s) => {
          const remaining = s.tabs.filter((t) => t.id !== tabId);
          const nextActive =
            s.activeTabId === tabId ? (remaining[0]?.id ?? null) : s.activeTabId;
          return { tabs: remaining, activeTabId: nextActive };
        });
      },

      renameTab: (tabId, name) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, name } : t,
          ),
        })),

      setActiveTab: (tabId) => {
        set((s) => {
          // 활성화 시 해당 탭의 모든 pane 을 acknowledged=true 로 세팅 →
          // 깜빡임 즉시 중지. 다음 완료 이벤트(busy→idle 전환)가 들어오면
          // setPaneStatus 에서 acknowledged=false 로 자동 리셋되어 다시 알림.
          const tab = s.tabs.find((t) => t.id === tabId);
          if (!tab || tab.type === "browser" || tab.type === "file") {
            return { activeTabId: tabId };
          }
          const panes = findAllPanes(tab.root);
          const nextStatuses = { ...s.paneStatuses };
          let changed = false;
          for (const pane of panes) {
            const st = nextStatuses[pane.id];
            if (st && !st.acknowledged) {
              nextStatuses[pane.id] = { ...st, acknowledged: true };
              changed = true;
            }
          }
          return changed
            ? { activeTabId: tabId, paneStatuses: nextStatuses }
            : { activeTabId: tabId };
        });
      },

      createBrowserTab: (url, tabName) => {
        const tabId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // browser 탭도 TerminalTab 타입 재사용 — root는 더미 leaf 사용 안 함.
        // 렌더러에서 type === "browser"일 때 BrowserPane으로 분기.
        const dummyPane: TerminalPane = {
          id: tabId,
          cwd: url ?? "",
          title: tabName ?? "새 브라우저",
          initialInput: null,
        };
        const tab: TerminalTab = {
          id: tabId,
          name: tabName ?? "브라우저",
          root: { type: "leaf", pane: dummyPane },
          type: "browser",
          url: url ?? "",
        };
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: tabId,
        }));
        return tabId;
      },

      setBrowserUrl: (id, url) =>
        set((s) => ({
          tabs: s.tabs.map((t) => {
            // 탭 자체가 브라우저 탭이면 tab.url 갱신
            if (t.id === id && t.type === "browser") {
              return { ...t, url };
            }
            // 아니면 split 트리 내의 browser pane 찾아서 갱신
            return { ...t, root: updateBrowserPaneUrl(t.root, id, url) };
          }),
        })),

      createFileTab: (filePath, tabName) => {
        const tabId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dummyPane: TerminalPane = {
          id: tabId,
          cwd: filePath ?? "",
          title: tabName ?? "파일 뷰어",
          initialInput: null,
          type: "file",
          filePath: filePath ?? "",
        };
        const tab: TerminalTab = {
          id: tabId,
          name: tabName ?? "파일",
          root: { type: "leaf", pane: dummyPane },
          type: "file",
          url: filePath ?? "",
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }));
        return tabId;
      },

      setFilePath: (id, filePath) =>
        set((s) => ({
          tabs: s.tabs.map((t) => ({
            ...t,
            root: updateFilePanePath(t.root, id, filePath),
          })),
        })),

      addRecentFile: (filePath) => {
        const p = filePath.trim();
        if (!p) return;
        set((s) => {
          const filtered = s.recentFiles.filter((x) => x !== p);
          return { recentFiles: [p, ...filtered].slice(0, 10) };
        });
      },

      addRecentUrl: (url) => {
        const u = url.trim();
        if (!u) return;
        set((s) => {
          const filtered = s.recentUrls.filter((x) => x !== u);
          return { recentUrls: [u, ...filtered].slice(0, 10) };
        });
      },

      setTerminalFontSize: (px) => {
        const v = Math.min(Math.max(Math.round(px), 8), 32);
        set({ terminalFontSize: v });
      },

      setMarkdownFontSize: (px) => {
        const v = Math.min(Math.max(Math.round(px), 10), 32);
        set({ markdownFontSize: v });
      },

      setPreferredEditor: (editor) => set({ preferredEditor: editor }),
      setCustomEditorCommand: (cmd) => set({ customEditorCommand: cmd }),

      reorderPanes: (sourceId, targetId) => {
        if (sourceId === targetId) return;
        set((s) => ({
          tabs: s.tabs.map((t) => ({
            ...t,
            root: reorderWithinSameSplit(t.root, sourceId, targetId),
          })),
        }));
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((s) => {
          if (
            fromIndex < 0 ||
            fromIndex >= s.tabs.length ||
            toIndex < 0 ||
            toIndex >= s.tabs.length ||
            fromIndex === toIndex
          ) {
            return s;
          }
          const next = [...s.tabs];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { tabs: next };
        });
      },

      duplicateTab: async (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        if (!tab) return null;
        if (tab.type === "browser") {
          return get().createBrowserTab(tab.url, tab.name);
        }
        if (tab.type === "file") {
          return get().createFileTab(tab.url, tab.name);
        }

        // 터미널 탭 — 분할 트리 구조를 유지하면서 새 탭 생성
        const newRoot = await cloneSplitNode(tab.root);
        if (!newRoot) return null;

        // 첫 pane을 기준으로 tabId 추출
        const firstPane = findAllPanes(newRoot)[0];
        const tabIdNew = `tab-${firstPane?.id ?? Date.now()}`;
        const newTab: TerminalTab = {
          id: tabIdNew,
          name: `${tab.name} (복제)`,
          root: newRoot,
          ticketId: null,
        };
        set((s) => ({
          tabs: [...s.tabs, newTab],
          activeTabId: tabIdNew,
        }));
        return tabIdNew;
      },

      splitPane: async (paneId, direction, opts) => {
        const tab = get().tabs.find((t) =>
          findAllPanes(t.root).some((p) => p.id === paneId),
        );
        if (!tab) return;
        const currentPane = findAllPanes(tab.root).find((p) => p.id === paneId);

        let newPane: TerminalPane;
        if (opts?.type === "browser") {
          // 브라우저 pane — pty 생성 안 함
          newPane = {
            id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            cwd: "",
            title: "브라우저",
            type: "browser",
            url: opts.url ?? "",
          };
        } else if (opts?.type === "file") {
          // 파일 뷰어 pane
          newPane = {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            cwd: "",
            title: "파일 뷰어",
            type: "file",
            filePath: opts.filePath ?? "",
          };
        } else {
          // opts.cwd가 명시되면 그 경로, 아니면 현재 패널 cwd를 기본으로 사용.
          const res = await createPty({ cwd: opts?.cwd ?? currentPane?.cwd });
          newPane = {
            id: res.id,
            cwd: res.cwd,
            title: shortCwd(res.cwd),
          };
        }

        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== tab.id) return t;
            // 같은 방향의 부모 split이 있으면 자식 추가 (플랫 구조 유지)
            const newRoot = addToSplitOrReplace(
              t.root,
              paneId,
              direction,
              newPane,
            );
            return { ...t, root: newRoot };
          }),
        }));
      },

      splitRightmostInActiveTab: async (cwd) => {
        const state = get();
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
        // 터미널 탭이 아니면 (browser/file) 아무것도 안 함
        if (!activeTab || activeTab.type === "browser" || activeTab.type === "file") {
          return;
        }
        const targetPaneId = rightmostLeafPaneId(activeTab.root);
        const resolvedCwd =
          cwd ?? useActiveProjectStore.getState().activeProjectPath ?? undefined;
        await get().splitPane(targetPaneId, "horizontal", { cwd: resolvedCwd });
      },

      closePane: async (paneId) => {
        // 브라우저/파일 pane은 pty 없음
        if (!paneId.startsWith("browser-") && !paneId.startsWith("file-")) {
          await deletePty(paneId);
        }
        set((s) => {
          const updated: TerminalTab[] = [];
          let activeTabId = s.activeTabId;
          for (const t of s.tabs) {
            const newRoot = removeLeaf(t.root, paneId);
            if (newRoot === null) {
              if (activeTabId === t.id) activeTabId = null;
              continue;
            }
            updated.push({ ...t, root: newRoot });
          }
          if (!activeTabId && updated[0]) activeTabId = updated[0].id;
          return { tabs: updated, activeTabId };
        });
      },

      syncWithServer: async () => {
        try {
          const res = await fetch("/api/terminals");
          if (!res.ok) return;
          const data = (await res.json()) as {
            terminals: Array<{ id: string }>;
          };
          const alive = new Set(data.terminals.map((t) => t.id));

          // 죽은 터미널 pane은 같은 cwd로 새 PTY 생성 → 앱 재시작 후 레이아웃 유지
          const updatedTabs: TerminalTab[] = [];
          for (const t of get().tabs) {
            if (t.type === "browser" || t.type === "file") {
              updatedTabs.push(t);
              continue;
            }
            const newRoot = await recreateDeadPanes(t.root, alive);
            if (newRoot) updatedTabs.push({ ...t, root: newRoot });
          }

          set((s) => {
            const activeStillAlive =
              s.activeTabId && updatedTabs.some((t) => t.id === s.activeTabId);
            return {
              tabs: updatedTabs,
              activeTabId: activeStillAlive
                ? s.activeTabId
                : (updatedTabs[0]?.id ?? null),
            };
          });
        } catch {
          // 네트워크 오류 시 기존 상태 유지
        }
      },
    }),
    {
      name: "cockpit-terminal-store",
      partialize: (s) => ({
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        recentFiles: s.recentFiles,
        recentUrls: s.recentUrls,
        terminalFontSize: s.terminalFontSize,
        markdownFontSize: s.markdownFontSize,
        preferredEditor: s.preferredEditor,
        customEditorCommand: s.customEditorCommand,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
        }
      },
    },
  ),
);

/** 특정 티켓이 현재 터미널에서 실행 중인지 확인 (primitive 반환으로 안정적) */
export function useIsTicketRunning(ticketId: string): boolean {
  return useTerminalStore((s) =>
    s.tabs.some((tab) => tab.ticketId === ticketId),
  );
}
