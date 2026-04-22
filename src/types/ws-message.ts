/**
 * 클라이언트 ↔ 서버 WebSocket 메시지 타입.
 * 서버(src/server/ws-handler.ts)와 클라이언트(src/lib/ws-client.ts) 양쪽에서 사용.
 */

export type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" };

export type ServerMessage =
  | { type: "history"; data: string } // 연결 직후 버퍼 snapshot
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string }
  | { type: "pong" }
  /**
   * PTY foreground 자식 프로세스 상태 요약.
   * server 가 1초 polling 으로 변화 감지 시 broadcast.
   * busy=true         → shell 자식(claude, node, vim...) 이 실행 중
   * busy=false        → shell 만 있음 (사용자가 명령 대기)
   * command           → busy 때 자식의 comm. idle 시 null.
   * awaitingInput     → busy && 최근 N초 출력 없음 → 응답 대기 추정.
   *                     (tab blink 트리거)
   */
  | {
      type: "status";
      busy: boolean;
      command: string | null;
      awaitingInput: boolean;
    };
