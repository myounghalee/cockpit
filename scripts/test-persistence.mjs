/**
 * Cycle 2.5 영속화 E2E 검증 스크립트
 *
 * 검증 시나리오:
 * T1 (암묵적) - 브로드캐스트 구조: 같은 pty에 2개 WebSocket 연결 → 한 쪽 input이 양쪽에 output으로 보임
 * T2 - 새로고침 시뮬레이션: 출력 후 WS close → 신규 연결 시 history 메시지 수신
 * T3 - stale 탭: 없는 pty에 연결 → 404 close
 * T5 - idle timeout: 구독자 0명 5초 지나면 pty 정리 (COCKPIT_PTY_IDLE_TIMEOUT_MS=5000 가정)
 * T7 - 256KB truncation: 큰 출력 → history 크기가 상한(기본 256KB) 이하
 */
import WebSocket from "ws";

const BASE = process.env.COCKPIT_URL ?? "http://127.0.0.1:8282";
const WS_BASE = BASE.replace(/^http/, "ws");

async function createPty() {
  const res = await fetch(`${BASE}/api/terminals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`create failed ${res.status}`);
  return (await res.json()).id;
}

async function deletePty(id) {
  await fetch(`${BASE}/api/terminals/${id}`, { method: "DELETE" });
}

async function listPtys() {
  const res = await fetch(`${BASE}/api/terminals`);
  return (await res.json()).terminals;
}

function connect(id) {
  return new WebSocket(`${WS_BASE}/ws/pty/${id}`, { headers: { origin: BASE } });
}

function waitMessage(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), timeout);
    const handler = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (predicate(msg)) {
        clearTimeout(t);
        ws.off("message", handler);
        resolve(msg);
      }
    };
    ws.on("message", handler);
  });
}

const TIMEOUT_SHORT = 3000;

async function test1_broadcast() {
  console.log("\n▶ T1: 두 클라이언트가 같은 pty를 공유 (broadcast)");
  const id = await createPty();
  const a = connect(id);
  const b = connect(id);
  await new Promise((r) => a.once("open", r));
  await new Promise((r) => b.once("open", r));

  // A에서 입력, B에서 output 수신 확인
  a.send(JSON.stringify({ type: "input", data: "echo BROADCAST_OK\r" }));
  const msgB = await waitMessage(b, (m) => m.type === "output" && m.data.includes("BROADCAST_OK"));
  console.log("  B도 수신 ✓ (길이 " + msgB.data.length + ")");

  a.close();
  b.close();
  await deletePty(id);
  console.log("  PASS");
}

async function test2_history_replay() {
  console.log("\n▶ T2: 재연결 시 history 수신 (새로고침 시뮬레이션)");
  const id = await createPty();

  // 첫 연결: 입력 → 출력 수신
  const ws1 = connect(id);
  await new Promise((r) => ws1.once("open", r));
  ws1.send(JSON.stringify({ type: "input", data: "echo HISTORY_CHECK_42\r" }));
  await waitMessage(ws1, (m) => m.type === "output" && m.data.includes("HISTORY_CHECK_42"));
  ws1.close();
  await new Promise((r) => setTimeout(r, 200));

  // 두 번째 연결: 첫 메시지로 history 수신, 그 안에 이전 출력이 포함되어야 함
  const ws2 = connect(id);
  await new Promise((r) => ws2.once("open", r));
  const history = await waitMessage(ws2, (m) => m.type === "history");
  if (!history.data.includes("HISTORY_CHECK_42")) {
    throw new Error("history missing HISTORY_CHECK_42");
  }
  console.log(`  history 크기 ${history.data.length} bytes, 이전 출력 포함 ✓`);

  ws2.close();
  await deletePty(id);
  console.log("  PASS");
}

async function test3_stale_404() {
  console.log("\n▶ T3: 존재하지 않는 pty 연결 시 close");
  const ws = connect("nonexistent-id-xxx");
  const closeEvent = await new Promise((resolve) => {
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  if (closeEvent.code !== 4404) throw new Error("expected close code 4404, got " + closeEvent.code);
  console.log(`  close code=${closeEvent.code} ✓`);
  console.log("  PASS");
}

async function test5_idle_timeout() {
  console.log("\n▶ T5: idle timeout (COCKPIT_PTY_IDLE_TIMEOUT_MS=5000)");
  const id = await createPty();
  const ws = connect(id);
  await new Promise((r) => ws.once("open", r));
  ws.close();
  await new Promise((r) => setTimeout(r, 500));

  // 아직 살아있어야 함
  let list = await listPtys();
  if (!list.some((t) => t.id === id)) {
    throw new Error("pty disposed too early");
  }
  console.log("  close 직후 pty 살아있음 ✓");

  // 6초 대기 후 정리됐는지 확인 (5초 타임아웃 + 여유)
  console.log("  6초 대기 중…");
  await new Promise((r) => setTimeout(r, 6000));
  list = await listPtys();
  if (list.some((t) => t.id === id)) {
    await deletePty(id);
    throw new Error("pty still alive after idle timeout");
  }
  console.log("  6초 후 pty 자동 정리됨 ✓");
  console.log("  PASS");
}

async function test7_truncation() {
  console.log("\n▶ T7: ring buffer truncation (256KB 상한)");
  const id = await createPty();
  const ws = connect(id);
  await new Promise((r) => ws.once("open", r));

  // 아주 큰 출력을 생성. seq 1..10000 정도면 80KB 내외. 3번 반복하면 240KB~.
  // 더 확실하게 하려면 5번.
  for (let i = 0; i < 5; i++) {
    ws.send(JSON.stringify({ type: "input", data: "seq 1 10000\r" }));
    // 모두 출력될 시간 대기
    await new Promise((r) => setTimeout(r, 800));
  }

  ws.close();
  await new Promise((r) => setTimeout(r, 300));

  // 재연결해서 history 크기 확인
  const ws2 = connect(id);
  await new Promise((r) => ws2.once("open", r));
  const hist = await waitMessage(ws2, (m) => m.type === "history", 5000);
  const size = hist.data.length;
  const max = 256 * 1024;
  console.log(`  history size: ${size} bytes (max: ${max})`);
  if (size > max + 8192) {
    // 마지막 청크 여유분 허용
    throw new Error(`history exceeds cap by more than allowance`);
  }
  console.log("  상한 준수 ✓");

  ws2.close();
  await deletePty(id);
  console.log("  PASS");
}

async function main() {
  try {
    await test1_broadcast();
    await test2_history_replay();
    await test3_stale_404();
    await test7_truncation();
    // T5는 COCKPIT_PTY_IDLE_TIMEOUT_MS=5000 환경에서만 의미있으므로 플래그로 분리
    if (process.env.TEST_IDLE === "1") {
      await test5_idle_timeout();
    } else {
      console.log("\n▶ T5: 건너뜀 (TEST_IDLE=1 로 활성)");
    }
    console.log("\n=== ALL PASSED ===");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ FAIL:", err.message);
    process.exit(1);
  }
}

main();
