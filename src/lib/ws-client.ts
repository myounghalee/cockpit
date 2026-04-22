import type { ClientMessage, ServerMessage } from "@/types/ws-message";

type Handler = (msg: ServerMessage) => void;

/**
 * pty용 브라우저 WebSocket 래퍼.
 * - 자동 재연결은 하지 않음 (pty 세션은 연결 기반이라 명시적 재연결이 맞음).
 * - 단방향 subscribe 인터페이스 제공.
 */
export class PtyWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private closed = false;
  private pending: ClientMessage[] = [];

  constructor(private readonly terminalId: string) {}

  connect(): void {
    if (this.ws || this.closed) return;
    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const url = `${wsProtocol}//${host}/ws/pty/${this.terminalId}`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      for (const msg of this.pending) {
        ws.send(JSON.stringify(msg));
      }
      this.pending = [];
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener("close", () => {
      this.ws = null;
    });

    ws.addEventListener("error", (ev) => {
      console.error("[ws-client] error", ev);
    });
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pending.push(msg);
      if (!this.ws) this.connect();
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  close(): void {
    this.closed = true;
    this.handlers.clear();
    if (this.ws) {
      try {
        this.ws.close(1000, "client close");
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
