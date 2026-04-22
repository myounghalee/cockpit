import type { WebSocket } from "ws";
import type { PtyManager } from "./pty-manager.js";

type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" };

type ServerMessage =
  | { type: "history"; data: string }
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string }
  | { type: "pong" }
  | {
      type: "status";
      busy: boolean;
      command: string | null;
      awaitingInput: boolean;
    };

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function handlePtyConnection(
  ws: WebSocket,
  terminalId: string,
  manager: PtyManager,
): void {
  const record = manager.get(terminalId);
  if (!record) {
    send(ws, { type: "error", message: `Terminal ${terminalId} not found` });
    ws.close(4404, "terminal not found");
    return;
  }

  // 1. 연결 직후 history replay
  const snapshot = record.buffer.snapshot();
  if (snapshot.length > 0) {
    send(ws, { type: "history", data: snapshot });
  }

  // 이미 exit된 pty에 접속한 경우 exit 메시지 한 번 더 알림
  if (record.exited) {
    send(ws, { type: "exit", code: 0 });
    ws.close(1000, "pty already exited");
    return;
  }

  // 2. 구독 등록 (브로드캐스트는 PtyManager가 담당)
  manager.addSubscriber(terminalId, ws);

  // 2.1. 현재 status 즉시 전송 — 탭 재오픈/재연결 시에도 UI 에 올바른 상태
  send(ws, {
    type: "status",
    busy: record.status.busy,
    command: record.status.command,
    awaitingInput: record.status.awaitingInput,
  });

  // 3. 클라 → pty 메시지 처리
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "invalid json" });
      return;
    }

    switch (msg.type) {
      case "input":
        record.pty.write(msg.data);
        break;
      case "resize":
        try {
          record.pty.resize(msg.cols, msg.rows);
        } catch (err) {
          send(ws, {
            type: "error",
            message: `resize failed: ${(err as Error).message}`,
          });
        }
        break;
      case "ping":
        send(ws, { type: "pong" });
        break;
      default:
        send(ws, { type: "error", message: "unknown message type" });
    }
  });

  ws.on("close", () => {
    manager.removeSubscriber(terminalId, ws);
  });

  ws.on("error", (err) => {
    console.error(`[ws] pty ${terminalId} error:`, err);
  });
}
