import { app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeTheme } from "electron";
import { spawn, execFile, type ChildProcess } from "child_process";
import { promisify } from "node:util";
import * as path from "path";
import * as http from "http";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";

const execFileAsync = promisify(execFile);

// 앱 이름 및 Bundle ID (macOS 알림 센터/Launchpad 등록에 사용)
app.setName("Cockpit");

// 단일 인스턴스 락 — 이미 실행 중인 Cockpit이 있으면 그 창을 포커스하고 종료.
// 복수 인스턴스가 동시에 떠서 포트 롤오버 → localStorage 파편화되는 문제 방지.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── 테마 연동 ────────────────────────────────────────────────
// 앱 창 배경색(= macOS 타이틀바 색)을 라이트/다크에 맞춰 동적 변경.
// renderer의 ThemeStore가 사용자 선택("system" | "light" | "dark")을
// IPC로 알려주면 여기서 실제 nativeTheme + setBackgroundColor 적용.
type ThemeMode = "system" | "light" | "dark";
let currentThemeMode: ThemeMode = "system";
// globals.css 의 --color-background 와 일치해야 한다.
const BG_DARK = "#0b0d12";
const BG_LIGHT = "#f8f9fb";

function resolveBgColor(): string {
  const effectiveDark =
    currentThemeMode === "dark" ||
    (currentThemeMode === "system" && nativeTheme.shouldUseDarkColors);
  return effectiveDark ? BG_DARK : BG_LIGHT;
}

function applyWindowTheme(win: BrowserWindow | null) {
  // macOS native titlebar(traffic light 영역) 색상은 nativeTheme.themeSource 로 결정된다.
  // setBackgroundColor 만 바꾸면 콘텐츠 아래 영역만 영향을 주고 타이틀바는 그대로.
  nativeTheme.themeSource = currentThemeMode;
  if (!win || win.isDestroyed()) return;
  win.setBackgroundColor(resolveBgColor());
}
// Windows: AppUserModelId (작업 표시줄 그룹화 + 알림 표시에 필요)
if (process.platform === "win32") {
  app.setAppUserModelId("dev.cockpit.app");
}

// userData 경로 고정 — 업데이트 후에도 동일한 localStorage/쿠키 유지.
// 기본은 ~/Library/Application Support/{app-name}인데, 실행 환경(네이티브 앱/dev/etc)에 따라
// 경로가 달라지면 localStorage 데이터가 손실됨 → 명시적 고정.
const COCKPIT_USER_DATA = path.join(os.homedir(), ".cockpit-userdata");
try {
  fs.mkdirSync(COCKPIT_USER_DATA, { recursive: true });
} catch {
  // ignore
}

// 기존에 쓰이던 위치에서 데이터 1회 마이그레이션 (Local Storage 파일 복사)
function migrateIfNeeded() {
  const newStorage = path.join(COCKPIT_USER_DATA, "Local Storage");
  if (fs.existsSync(newStorage)) return; // 이미 새 위치에 데이터 있음

  // 후보 legacy 경로들 (Mac/Linux/Win)
  const legacyCandidates =
    process.platform === "darwin"
      ? [
          path.join(os.homedir(), "Library", "Application Support", "Cockpit"),
          path.join(os.homedir(), "Library", "Application Support", "Electron"),
          path.join(os.homedir(), "Library", "Application Support", "cockpit"),
        ]
      : process.platform === "win32"
        ? [
            path.join(os.homedir(), "AppData", "Roaming", "Cockpit"),
            path.join(os.homedir(), "AppData", "Roaming", "Electron"),
          ]
        : [
            path.join(os.homedir(), ".config", "Cockpit"),
            path.join(os.homedir(), ".config", "Electron"),
          ];

  for (const legacy of legacyCandidates) {
    const legacyStorage = path.join(legacy, "Local Storage");
    if (!fs.existsSync(legacyStorage)) continue;
    try {
      fs.cpSync(legacyStorage, newStorage, { recursive: true });
      console.log(`[cockpit] localStorage 마이그레이션: ${legacy} → ${COCKPIT_USER_DATA}`);
      break;
    } catch (err) {
      console.warn(
        `[cockpit] 마이그레이션 실패 (${legacy}):`,
        (err as Error).message,
      );
    }
  }
}
migrateIfNeeded();
app.setPath("userData", COCKPIT_USER_DATA);



/**
 * 실행 환경별 ROOT 결정:
 *   - dev (pnpm electron:dev): 레포 루트 (소스 직접 참조)
 *   - 패키지된 .app: ~/.cockpit-app (install.sh로 사용자 홈에 설치된 소스)
 *     .app 번들에는 소스/node_modules/Prisma 엔진이 들어있지 않으므로
 *     "런처"로만 동작하고 실제 서버는 설치된 소스에서 실행한다.
 */
const COCKPIT_APP_HOME = path.join(os.homedir(), ".cockpit-app");
const ROOT = app.isPackaged
  ? COCKPIT_APP_HOME
  : path.resolve(__dirname, "..");

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let PORT = 8282; // 포트 충돌 시 자동으로 빈 포트로 변경

// ─── 빈 포트 찾기 ────────────────────────────────────────────
/** 포트가 free인지 확인 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

/**
 * 이전에 사용했던 포트를 파일에 저장 — 재시작 시 같은 포트를 재사용하기 위함.
 * 포트가 바뀌면 localStorage origin이 바뀌어 데이터가 유실됨.
 */
const PORT_FILE = path.join(COCKPIT_USER_DATA, "last-port");

function readSavedPort(): number | null {
  try {
    const txt = fs.readFileSync(PORT_FILE, "utf8").trim();
    const n = Number(txt);
    if (Number.isFinite(n) && n > 1024 && n < 65536) return n;
  } catch {
    // ignore
  }
  return null;
}

function writeSavedPort(port: number): void {
  try {
    fs.writeFileSync(PORT_FILE, String(port));
  } catch {
    // ignore
  }
}

/**
 * 이전 Cockpit 실행에서 남은 고아 서버 프로세스를 찾아 정리.
 * Electron이 강제종료되면 spawn한 node 자식이 살아남아 포트를 붙잡고 있음.
 * 이 상태에서 다시 실행하면 findFreePort가 다른 포트로 튀어 localStorage가
 * 파편화됨. 시작 시 우리 서버(ROOT/server.ts) 만 정확히 식별해 제거.
 */
async function killStaleCockpitServers(): Promise<void> {
  const marker = path.join(ROOT, "server.ts");
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      "-iTCP",
      "-sTCP:LISTEN",
      "-t",
    ]);
    const pids = [
      ...new Set(
        stdout
          .split("\n")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid),
      ),
    ];
    for (const pid of pids) {
      let cmd = "";
      try {
        const { stdout: out } = await execFileAsync("ps", [
          "-p",
          String(pid),
          "-o",
          "command=",
        ]);
        cmd = out;
      } catch {
        continue; // 프로세스 이미 종료됨
      }
      if (!cmd.includes(marker)) continue; // 우리 서버 아님 — 건드리지 않음
      console.log(`[cockpit] stale server 발견: pid=${pid} → SIGTERM`);
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        continue;
      }
      // 최대 1.5초 대기, 살아있으면 SIGKILL
      for (let waited = 0; waited < 1500; waited += 150) {
        await new Promise((r) => setTimeout(r, 150));
        try {
          process.kill(pid, 0); // 생사 확인
        } catch {
          // 죽음
          console.log(`[cockpit] pid=${pid} 정상 종료`);
          break;
        }
      }
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
        console.log(`[cockpit] pid=${pid} SIGKILL`);
      } catch {
        // 이미 죽음 — OK
      }
    }
  } catch {
    // lsof 없거나 권한 문제 — 무시하고 기존 로직으로 진행
  }
}

/**
 * 포트 선택 우선순위:
 * 1. 저장된 이전 포트 (빈 경우)
 * 2. preferred 포트가 최대 10초 내 풀리면 사용
 * 3. 8283~8302 순차 시도
 * 4. OS 할당 빈 포트
 */
async function findFreePort(
  preferred: number,
  maxWaitMs = 10_000,
): Promise<number> {
  // 1. 이전 포트 재사용
  const saved = readSavedPort();
  if (saved && (await isPortFree(saved))) return saved;

  // 2. preferred 포트 대기
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isPortFree(preferred)) return preferred;
    await new Promise((r) => setTimeout(r, 500));
  }

  // 3. 8283~8302 순차 시도 → 범위 내에서 적어도 하나는 안정적으로 잡기
  for (let p = preferred + 1; p <= preferred + 20; p++) {
    if (await isPortFree(p)) return p;
  }

  // 4. OS 할당
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr !== "string") resolve(addr.port);
        else resolve(preferred);
      });
    });
  });
}

// ─── 서버 기동 대기 ──────────────────────────────────────────
function waitForServer(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("서버 기동 타임아웃 (30초)"));
      }
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        setTimeout(check, 500);
      });
      req.on("error", () => setTimeout(check, 500));
      req.end();
    };
    check();
  });
}

// ─── 서버 프로세스 시작 ──────────────────────────────────────
// 서버 로그 파일 (디버깅용)
const SERVER_LOG = path.join(ROOT, "logs", "server.log");
let serverStderr = "";

function startServer(): void {
  // 로그 디렉토리 생성
  try {
    fs.mkdirSync(path.dirname(SERVER_LOG), { recursive: true });
  } catch {
    // ignore
  }

  const serverScript = path.join(ROOT, "server.ts");
  const tsxBin = path.join(ROOT, "node_modules", ".bin", "tsx");
  const nextBuildId = path.join(ROOT, ".next", "BUILD_ID");

  // tsx 바이너리가 없으면 설치 안 됐다는 뜻 — dev 모드에서만 에러.
  // 패키지드 환경에서는 app.whenReady에서 installCockpitIfNeeded()가 먼저 처리함.
  if (!fs.existsSync(tsxBin)) {
    const detail = app.isPackaged
      ? `설치가 완료되지 않았습니다.\n\n경로: ${tsxBin}\n\n앱을 다시 실행하거나 터미널에서:\n  curl -fsSL https://raw.githubusercontent.com/myounghalee/cockpit/main/install.sh | bash`
      : `tsx 바이너리를 찾을 수 없습니다.\n\n경로: ${tsxBin}\n\n'pnpm install' 을 실행해주세요.`;
    dialog.showErrorBox("Cockpit 시작 실패", detail);
    app.quit();
    return;
  }

  // 패키지드 환경은 production 모드로 돌리므로 .next 빌드가 필요.
  // 설치 스크립트가 build까지 책임지지만, 구버전 잔여분이 있거나 업데이트 직후엔 누락될 수 있음.
  if (app.isPackaged && !fs.existsSync(nextBuildId)) {
    dialog.showErrorBox(
      "Cockpit 시작 실패",
      `Next.js 빌드가 없습니다. 터미널에서 아래를 실행해 주세요:\n\n  cd ~/.cockpit-app && pnpm build\n\n그 후 앱을 다시 실행하세요.`,
    );
    app.quit();
    return;
  }

  const child = spawn(tsxBin, [serverScript], {
    cwd: ROOT,
    // buildSpawnEnv()로 nvm/Homebrew PATH 보강 — tsx가 내부적으로 `node`를 찾아 실행하므로 필수.
    // 패키지드 .app은 production 모드로 돌려 dev 모드 JIT 컴파일 오버헤드를 제거.
    env: {
      ...buildSpawnEnv(),
      PORT: String(PORT),
      HOST: "127.0.0.1",
      NODE_ENV: app.isPackaged ? "production" : "development",
      // 서버가 부모(Electron) 생사를 감시해 고아화되면 자동 종료하도록
      COCKPIT_PARENT_PID: String(process.pid),
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    console.log(`[server] ${text.trim()}`);
    try {
      fs.appendFileSync(SERVER_LOG, text);
    } catch {
      // ignore
    }
  });
  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    serverStderr += text;
    console.error(`[server] ${text.trim()}`);
    try {
      fs.appendFileSync(SERVER_LOG, `[ERR] ${text}`);
    } catch {
      // ignore
    }
  });
  child.on("exit", (code) => {
    console.log(`[server] 프로세스 종료 (code=${code})`);
    serverProcess = null;
  });

  serverProcess = child;
}

// ─── 메뉴 ────────────────────────────────────────────────────
function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: any[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "편집",
      submenu: [
        { role: "undo", label: "실행 취소" },
        { role: "redo", label: "다시 실행" },
        { type: "separator" },
        { role: "cut", label: "잘라내기" },
        { role: "copy", label: "복사" },
        { role: "paste", label: "붙여넣기" },
        { role: "selectAll", label: "전체 선택" },
      ],
    },
    {
      label: "보기",
      submenu: [
        { role: "reload", label: "새로고침" },
        { role: "forceReload", label: "강제 새로고침" },
        { role: "toggleDevTools", label: "개발자 도구" },
        { type: "separator" },
        { role: "zoomIn", label: "확대" },
        { role: "zoomOut", label: "축소" },
        { role: "resetZoom", label: "기본 크기" },
        { type: "separator" },
        { role: "togglefullscreen", label: "전체 화면" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── 창 생성 ─────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Cockpit",
    // 창 생성 전에 themeSource 도 동기화 — 타이틀바 첫 렌더가 맞는 색으로
    backgroundColor: (() => {
      nativeTheme.themeSource = currentThemeMode;
      return resolveBgColor();
    })(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // <webview> 활성화 — 브라우저 pane에서 X-Frame-Options 우회용
    },
  });

  // 시스템 다크/라이트 변경에 즉시 반응 (사용자 모드가 "system" 일 때만 의미 있음)
  nativeTheme.on("updated", () => applyWindowTheme(mainWindow));

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  // 페이지 title이 창 타이틀을 덮어쓰지 않도록 고정
  mainWindow.on("page-title-updated", (e) => e.preventDefault());

  // window.open() 호출 시 외부 URL은 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }: any) => {
    if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  // <a href="..."> 링크 클릭 등으로 앱이 외부 URL로 navigate하려 할 때 차단
  mainWindow.webContents.on("will-navigate", (event: any, url: string) => {
    if (!url.startsWith("http://127.0.0.1")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── 최초 설치 (패키지드 .app 전용) ───────────────────────────

/** nvm으로 설치된 Node 중 가장 최신 버전의 bin 디렉토리 반환 */
function findNvmNodeBin(): string | null {
  const nvmRoot = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    const versions = fs
      .readdirSync(nvmRoot)
      .filter((v) => /^v\d+\.\d+\.\d+$/.test(v));
    if (versions.length === 0) return null;
    // semver desc 정렬 — 최신 버전 우선
    versions.sort((a, b) => {
      const [am, ai, ap] = a.slice(1).split(".").map(Number);
      const [bm, bi, bp] = b.slice(1).split(".").map(Number);
      return bm - am || bi - ai || bp - ap;
    });
    return path.join(nvmRoot, versions[0], "bin");
  } catch {
    return null;
  }
}

/**
 * macOS launchd로 띄워진 앱은 PATH가 매우 제한적이라
 * Homebrew/nvm/로컬 경로를 모두 prepend한 환경을 만든다.
 * install.sh 실행과 server(tsx) spawn 양쪽에서 사용.
 */
function buildSpawnEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const nvmBin = findNvmNodeBin();
  const extraPaths: string[] = [];
  if (nvmBin) extraPaths.push(nvmBin);
  extraPaths.push(
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    path.join(home, ".local", "bin"),
  );
  return {
    ...process.env,
    PATH: [...extraPaths, process.env.PATH ?? ""].filter(Boolean).join(":"),
    HOME: home,
  };
}

/** 설치 진행 상황을 보여주는 splash 창 — data URL로 인라인 HTML 로드 */
function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 520,
    height: 360,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#0b0d12",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>Cockpit 설치</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: #0b0d12; color: #e4e4e7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    height: 100vh; display: flex; flex-direction: column; gap: 12px;
  }
  .title { font-size: 16px; font-weight: 600; }
  .sub { font-size: 12px; color: #a1a1aa; }
  .spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid #7c3aed44; border-top-color: #a78bfa;
    animation: spin 0.8s linear infinite;
  }
  .row { display: flex; align-items: center; gap: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #log {
    flex: 1; margin: 0; padding: 10px 12px;
    background: #000; color: #c7c7cc;
    font-family: "SF Mono", Menlo, monospace; font-size: 11px;
    border: 1px solid #27272a; border-radius: 6px;
    overflow-y: auto; white-space: pre-wrap; word-break: break-all;
  }
</style>
</head>
<body>
  <div class="row">
    <div class="spinner"></div>
    <div class="title">Cockpit 최초 설치 중…</div>
  </div>
  <div class="sub">GitHub에서 소스와 의존성을 받아 ~/.cockpit-app 에 설치합니다. 2-5분 정도 걸릴 수 있어요.</div>
  <pre id="log"></pre>
  <script>
    window.appendLog = (t) => {
      const el = document.getElementById('log');
      el.textContent += t;
      el.scrollTop = el.scrollHeight;
    };
  </script>
</body>
</html>`;
  splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  return splash;
}

/** ~/.cockpit-app 소스가 없으면 install.sh 자동 실행 — 패키지드 환경에서만 동작 */
async function installCockpitIfNeeded(): Promise<void> {
  if (!app.isPackaged) return;
  const tsxBin = path.join(COCKPIT_APP_HOME, "node_modules", ".bin", "tsx");
  if (fs.existsSync(tsxBin)) return;

  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "Cockpit 최초 설치",
    message: "Cockpit 소스를 설치하시겠습니까?",
    detail:
      "~/.cockpit-app 에 GitHub 저장소를 clone하고 의존성을 설치합니다 (약 200MB, 2-5분 소요).\n\n필요 사항: Node.js 20+, git, curl\n(pnpm은 자동 설치)",
    buttons: ["설치", "취소"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) {
    app.quit();
    return Promise.reject(new Error("사용자가 설치를 취소했습니다."));
  }

  const splash = createSplashWindow();
  const logPath = path.join(COCKPIT_USER_DATA, "install.log");
  try {
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] install 시작\n`);
  } catch {
    // ignore
  }

  await new Promise<void>((resolve, reject) => {
    const installScript =
      "curl -fsSL https://raw.githubusercontent.com/myounghalee/cockpit/main/install.sh | bash";
    const child = spawn("bash", ["-lc", installScript], {
      // COCKPIT_INSTALL_ONLY=1 → install.sh가 Electron 실행 안 하고 종료 (중복 실행 방지)
      env: { ...buildSpawnEnv(), COCKPIT_INSTALL_ONLY: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const appendLog = (text: string) => {
      try {
        fs.appendFileSync(logPath, text);
      } catch {
        // ignore
      }
      if (!splash.isDestroyed()) {
        splash.webContents
          .executeJavaScript(`window.appendLog(${JSON.stringify(text)})`)
          .catch(() => {
            // ignore
          });
      }
    };

    child.stdout?.on("data", (d: Buffer) => appendLog(d.toString()));
    child.stderr?.on("data", (d: Buffer) =>
      appendLog(`[ERR] ${d.toString()}`),
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `install.sh 실패 (exit ${code}). 자세한 로그: ${logPath}`,
          ),
        );
    });
    child.on("error", (err) => reject(err));
  }).finally(() => {
    if (!splash.isDestroyed()) splash.close();
  });
}

// ─── 자동 업데이트 체크 (백그라운드) ──────────────────────────

type UpdateStatus = "idle" | "checking" | "updating" | "ready" | "failed";
let updateStatus: UpdateStatus = "idle";
let updateError: string | null = null;

function setUpdateStatus(s: UpdateStatus, err: string | null = null) {
  updateStatus = s;
  updateError = err;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cockpit:update-status", s);
  }
}

/** 원격과 현재 HEAD 비교 — 가져올 커밋 있으면 true */
async function hasRemoteUpdates(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["fetch", "--quiet", "origin", "main"], {
      cwd,
      env: buildSpawnEnv(),
      timeout: 10_000,
    });
    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--count", "HEAD..origin/main"],
      { cwd, env: buildSpawnEnv(), timeout: 5_000 },
    );
    return Number(stdout.trim()) > 0;
  } catch {
    return false;
  }
}

async function runSpawn(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: buildSpawnEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${stderr}`));
    });
    child.on("error", reject);
  });
}

async function checkAndApplyUpdateBackground(): Promise<void> {
  // 개발 모드에선 자동 업데이트 스킵 (소스 직접 수정 중인 경우 충돌 방지)
  if (!app.isPackaged) return;
  // 환경변수로 꺼둘 수 있게
  if (process.env.COCKPIT_NO_AUTO_UPDATE === "1") return;
  // git repo가 아니면 스킵
  if (!fs.existsSync(path.join(ROOT, ".git"))) return;

  try {
    setUpdateStatus("checking");
    const hasUpdates = await hasRemoteUpdates(ROOT);
    if (!hasUpdates) {
      setUpdateStatus("idle");
      return;
    }

    setUpdateStatus("updating");
    await runSpawn("git", ["pull", "--ff-only", "origin", "main"], ROOT);
    await runSpawn("pnpm", ["install", "--prod=false"], ROOT);
    await runSpawn("pnpm", ["prisma", "generate"], ROOT);
    // 마이그레이션은 실패해도 빌드는 진행 (대부분의 업데이트엔 없음)
    await runSpawn("pnpm", ["prisma", "migrate", "deploy"], ROOT).catch(
      () => {},
    );
    await runSpawn("pnpm", ["build"], ROOT);

    setUpdateStatus("ready");
  } catch (err) {
    console.error("[cockpit] 자동 업데이트 실패:", err);
    setUpdateStatus("failed", (err as Error).message);
  }
}

// ─── 앱 라이프사이클 ─────────────────────────────────────────
app.whenReady().then(async () => {
  // IPC 브릿지 — renderer의 UpdateBanner에서 사용
  ipcMain.handle("cockpit:get-update-status", () => updateStatus);
  ipcMain.handle("cockpit:get-update-error", () => updateError);
  ipcMain.handle("cockpit:apply-update", () => {
    app.relaunch();
    app.exit(0);
  });
  // 테마 모드 동기화 — renderer의 ThemeStore가 변경 시 호출
  ipcMain.on("cockpit:set-theme-mode", (_e, mode: ThemeMode) => {
    if (mode === "system" || mode === "light" || mode === "dark") {
      currentThemeMode = mode;
      applyWindowTheme(mainWindow);
    }
  });
  buildMenu();

  // 최초 실행 시 소스 자동 설치
  try {
    await installCockpitIfNeeded();
  } catch (err) {
    dialog.showErrorBox(
      "Cockpit 설치 실패",
      `${(err as Error).message}\n\n터미널에서 수동 설치를 시도해보세요:\n  curl -fsSL https://raw.githubusercontent.com/myounghalee/cockpit/main/install.sh | bash`,
    );
    app.quit();
    return;
  }

  // 이전 실행에서 남은 고아 서버 정리 (우리 서버만 정확히 식별해 제거)
  await killStaleCockpitServers();

  // 빈 포트 먼저 확보 — 저장된 포트 우선, 8282 대기, 8283~8302 시도
  PORT = await findFreePort(8282);
  writeSavedPort(PORT);
  console.log(`[cockpit] 포트 선택: ${PORT}`);

  startServer();

  try {
    console.log(`[cockpit] 서버 시작 중 (port=${PORT})…`);
    await waitForServer();
    console.log(`[cockpit] 서버 준비 완료!`);
    createWindow();
    // 창 로드 완료 후 백그라운드로 업데이트 체크 (2초 지연 — 초기 렌더 방해 방지)
    setTimeout(() => {
      checkAndApplyUpdateBackground().catch((err) =>
        console.warn("[cockpit] updater:", (err as Error).message),
      );
    }, 2000);
  } catch (err) {
    console.error("[cockpit] 서버 시작 실패:", err);
    // 에러 상세 표시 (stderr 수집 포함)
    const message = (err as Error).message;
    const detail = serverStderr.slice(-2000) || "서버 로그가 없습니다.";
    dialog.showErrorBox(
      "Cockpit 서버 시작 실패",
      `${message}\n\n[서버 로그 마지막]\n${detail}\n\n로그 전체: ${SERVER_LOG}\n\n포트 8282가 다른 프로세스에 의해 사용 중일 수 있습니다.\n터미널에서 'lsof -ti :8282' 으로 확인해주세요.`,
    );
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  const child = serverProcess;
  if (child && !child.killed) {
    serverProcess = null;
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    // 2초 내 안 죽으면 SIGKILL (자식이 응답 없이 매달려 있을 수 있음)
    setTimeout(() => {
      try {
        if (child.exitCode === null && child.pid !== undefined) {
          process.kill(child.pid, "SIGKILL");
        }
      } catch {
        // already dead
      }
    }, 2000);
  }
});
