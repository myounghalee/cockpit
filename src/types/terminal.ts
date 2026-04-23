/**
 * 터미널 UI 상태 타입.
 * SplitNode는 재귀 구조로 N단 분할을 표현.
 */

export interface TerminalPane {
  id: string; // 터미널이면 서버 pty id와 동일, 브라우저면 클라이언트 생성 uuid
  cwd: string;
  title: string;
  /**
   * 터미널 WS 연결 직후 1회 자동 주입할 입력. 티켓 실행 등에서 사용.
   * 주입 후에는 store에서 null로 지워진다 (재연결 시 중복 주입 방지).
   */
  initialInput?: string | null;
  /** pane 종류 — "terminal"(기본), "browser", "file", "memo" */
  type?: "terminal" | "browser" | "file" | "memo";
  /** browser pane 전용 URL */
  url?: string;
  /** file pane 전용 절대 경로 */
  filePath?: string;
  /** memo pane 전용 id (Memo.id) */
  memoId?: string;
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
  /** 탭 종류 — "terminal"(기본), "browser", "file", "memo" */
  type?: "terminal" | "browser" | "file" | "memo";
  /** browser 탭 전용 URL / file 탭 전용 경로 / memo 탭 전용 memoId */
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
