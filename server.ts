/**
 * Cockpit Custom Server
 * -----------------------
 * Next.js의 HTTP 요청과 WebSocket(/ws/pty/:id)을 한 서버에서 동시에 처리.
 * - HTTP: Next가 처리 (pages + API routes)
 * - WebSocket: ws 라이브러리 + PtyManager
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { handlePtyConnection } from "./src/server/ws-handler.js";
import { PtyManager } from "./src/server/pty-manager.js";

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8282);

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

const ptyManager = new PtyManager();
// 서버 종료 시 모든 pty 정리
for (const signal of ["SIGINT", "SIGTERM", "exit"] as const) {
  process.on(signal, () => {
    ptyManager.disposeAll();
    if (signal !== "exit") process.exit(0);
  });
}

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/");
    const match = pathname?.match(/^\/ws\/pty\/([\w-]+)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    // origin 체크 — 동일 호스트만 허용
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const allowed =
          originUrl.hostname === host ||
          originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1";
        if (!allowed) {
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }

    const terminalId = match[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      handlePtyConnection(ws, terminalId, ptyManager);
    });
  });

  // PtyManager를 global에 노출 → API routes에서 접근
  // (Next.js의 route.ts가 별도 V8 context가 아니라 같은 프로세스이므로 globalThis로 공유 가능)
  (globalThis as unknown as { __cockpitPtyManager?: PtyManager }).__cockpitPtyManager = ptyManager;

  httpServer.listen(port, host, () => {
    console.log(`\n  🛩  Cockpit ready on http://${host}:${port}\n`);
  });
}

main().catch((err) => {
  console.error("Cockpit server failed to start:", err);
  process.exit(1);
});
