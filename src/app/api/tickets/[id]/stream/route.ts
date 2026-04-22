import fsp from "node:fs/promises";
import { runner, type RunnerAction } from "@/lib/claude-runner";

/**
 * 티켓의 Claude 실행을 SSE로 스트리밍.
 *
 * 이벤트:
 *  - backfill   : 연결 시 기존 raw 로그 (stream-json 원문 포함)
 *  - action     : tool_use / tool_result 기반 구조화 액션 (running → done)
 *  - data       : 실행 중 raw chunk (디버깅용)
 *  - status     : 현재 실행 상태
 *  - exit       : 프로세스 종료 (code 포함)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: string) => {
        const lines = data.split("\n").map((l) => `data: ${l}`).join("\n");
        controller.enqueue(
          encoder.encode(`event: ${event}\n${lines}\n\n`),
        );
      };

      // 1) 기존 raw 로그 backfill
      try {
        const logPath = runner.getLogPath(id);
        const content = await fsp.readFile(logPath, "utf8");
        if (content) send("backfill", content);
      } catch {
        // 파일 없음
      }

      // 2) 기존 액션 backfill (JSONL)
      try {
        const actionsPath = runner.getActionsPath(id);
        const raw = await fsp.readFile(actionsPath, "utf8");
        for (const line of raw.split("\n")) {
          const t = line.trim();
          if (!t) continue;
          try {
            JSON.parse(t); // 검증만 — 그대로 전달
            send("action", t);
          } catch {
            // skip
          }
        }
      } catch {
        // 파일 없음
      }

      // 3) 상태
      const state = runner.getState(id);
      send(
        "status",
        JSON.stringify({
          running: runner.isRunning(id),
          state,
        }),
      );

      // 4) 실시간 구독
      const onData = (ticketId: string, chunk: string) => {
        if (ticketId !== id) return;
        send("data", chunk);
      };
      const onAction = (ticketId: string, action: RunnerAction) => {
        if (ticketId !== id) return;
        send("action", JSON.stringify(action));
      };
      const onExit = (ticketId: string, code: number | null) => {
        if (ticketId !== id) return;
        send("exit", JSON.stringify({ code }));
        cleanup();
        try {
          controller.close();
        } catch {
          // 이미 닫힘
        }
      };

      runner.on("data", onData);
      runner.on("action", onAction);
      runner.on("exit", onExit);

      const cleanup = () => {
        runner.off("data", onData);
        runner.off("action", onAction);
        runner.off("exit", onExit);
        clearInterval(heartbeat);
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);
    },
    cancel() {
      // EventSource.close() 시 start() 내부 cleanup이 호출됨
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
