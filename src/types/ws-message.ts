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
  | { type: "pong" };
