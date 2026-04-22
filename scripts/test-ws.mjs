// Cockpit WebSocket 터미널 동작 E2E 테스트 스크립트.
// - POST /api/terminals 로 pty 생성
// - WebSocket 연결 → input 전송 → output 수신 확인
// - DELETE 로 정리
import WebSocket from "ws";

const BASE = process.env.COCKPIT_URL ?? "http://127.0.0.1:4000";

async function main() {
  // 1. 터미널 생성
  const createRes = await fetch(`${BASE}/api/terminals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!createRes.ok) {
    console.error("FAIL: create", createRes.status);
    process.exit(1);
  }
  const { id, pid } = await createRes.json();
  console.log(`✓ created pty id=${id} pid=${pid}`);

  // 2. WebSocket 연결
  const wsUrl = BASE.replace(/^http/, "ws") + `/ws/pty/${id}`;
  const ws = new WebSocket(wsUrl, { headers: { origin: BASE } });

  let output = "";
  const timeout = setTimeout(() => {
    console.error("FAIL: timeout - no output");
    ws.close();
    cleanup(id).finally(() => process.exit(1));
  }, 5000);

  ws.on("open", () => {
    console.log("✓ ws open");
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    ws.send(JSON.stringify({ type: "input", data: "echo COCKPIT_TEST_123\r" }));
  });

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "output") {
      output += msg.data;
      if (output.includes("COCKPIT_TEST_123") && output.split("COCKPIT_TEST_123").length >= 3) {
        // 명령 echo + 실제 출력으로 2번 이상 등장
        clearTimeout(timeout);
        console.log("✓ output received (echo reply seen)");
        ws.close();
        await cleanup(id);
        console.log("✓ cleanup done");
        console.log("\n=== ALL PASSED ===");
        process.exit(0);
      }
    } else if (msg.type === "error") {
      console.error("FAIL: server error:", msg.message);
      ws.close();
      await cleanup(id);
      process.exit(1);
    }
  });

  ws.on("error", (err) => {
    console.error("FAIL: ws error:", err.message);
    clearTimeout(timeout);
    cleanup(id).finally(() => process.exit(1));
  });
}

async function cleanup(id) {
  try {
    await fetch(`${BASE}/api/terminals/${id}`, { method: "DELETE" });
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
