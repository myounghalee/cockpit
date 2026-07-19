/**
 * 터미널 UI 상태 타입.
 * SplitNode는 재귀 구조로 N단 분할을 표현.
 */

/** pane/탭 종류. undefined는 "terminal"과 동일하게 취급한다(레거시 호환). */
export type PaneType = "terminal" | "browser" | "file" | "memo" | "git";

/**
 * PTY를 갖지 않는 pane인가.
 *
 * 화이트리스트("terminal만 PTY를 가진다")로 판정한다. 예전에는 각 호출부가
 * `type === "browser" || type === "file" || type === "memo"` 를 직접 나열했는데,
 * 새 타입을 추가할 때마다 9곳을 모두 고쳐야 해서 실제로 누락 버그가 났다.
 */
export function isNonTerminalPane(type?: PaneType): boolean {
  return type !== undefined && type !== "terminal";
}

/** PTY 없이 클라이언트에서만 사는 pane의 id 접두사 */
const NON_PTY_ID_PREFIXES = ["browser-", "file-", "memo-", "git-"];

/** 이 pane id가 서버 PTY에 대응하는가 (DELETE /api/terminals 대상인지 판단) */
export function paneIdHasPty(paneId: string): boolean {
  return !NON_PTY_ID_PREFIXES.some((p) => paneId.startsWith(p));
}

export interface TerminalPane {
  id: string; // 터미널이면 서버 pty id와 동일, 브라우저면 클라이언트 생성 uuid
  cwd: string;
  title: string;
  /**
   * 터미널 WS 연결 직후 1회 자동 주입할 입력. 티켓 실행 등에서 사용.
   * 주입 후에는 store에서 null로 지워진다 (재연결 시 중복 주입 방지).
   */
  initialInput?: string | null;
  /** pane 종류 — "terminal"(기본), "browser", "file", "memo", "git" */
  type?: PaneType;
  /** browser pane 전용 URL */
  url?: string;
  /** file pane 전용 절대 경로 */
  filePath?: string;
  /** memo pane 전용 id (Memo.id) */
  memoId?: string;
  /** git pane 전용 Project.id */
  projectId?: string;
}

export type SplitDirection = "horizontal" | "vertical";

export type SplitNode =
  | { type: "leaf"; pane: TerminalPane }
  | { type: "split"; direction: SplitDirection; children: SplitNode[] };

export interface TerminalTab {
  id: string;
  name: string;
  root: SplitNode;
  /** 이 탭을 생성한 칸반 티켓 ID (실행 중 표시에 사용) */
  ticketId?: string | null;
  /** 탭 종류 — "terminal"(기본), "browser", "file", "memo", "git" */
  type?: PaneType;
  /**
   * 비-터미널 탭의 식별자 겸용 필드.
   * browser=URL / file=절대경로 / memo=memoId / git=projectId
   */
  url?: string;
}

export interface CreateTerminalResponse {
  id: string;
  pid: number;
  cwd: string;
  shell: string;
  createdAt: string;
}

export interface ListTerminalsResponse {
  terminals: Array<{
    id: string;
    cwd: string;
    shell: string;
    pid: number;
    createdAt: string;
  }>;
}
