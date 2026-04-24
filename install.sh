#!/usr/bin/env bash
# Cockpit 설치 스크립트
# 사용법: curl -fsSL https://raw.githubusercontent.com/myounghalee/cockpit/main/install.sh | bash
#
# 하는 일:
# 1. ~/.cockpit 에 clone (이미 있으면 pull)
# 2. cockpit 명령어를 셸 프로파일에 등록
# 3. 바로 실행
set -euo pipefail

INSTALL_DIR="$HOME/.cockpit-app"
REPO="https://github.com/myounghalee/cockpit.git"
BRANCH="main"

log() { printf "\033[1;34m[cockpit]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[cockpit]\033[0m %s\n" "$*" >&2; }

# ---------- Node.js 체크 ----------
if ! command -v node >/dev/null 2>&1; then
  err "Node.js가 필요합니다. https://nodejs.org 에서 Node 20+ 설치 후 다시 시도하세요."
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  err "Node 20 이상이 필요합니다. 현재: $(node -v)"
  exit 1
fi

# ---------- pnpm 체크 ----------
if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm 설치 중…"
  # npm -g 는 권한 문제 가능성 → 공식 인스톨러 우선, 실패 시 npm -g fallback
  if ! curl -fsSL https://get.pnpm.io/install.sh | sh - >/dev/null 2>&1; then
    log "공식 인스톨러 실패 — npm -g 로 재시도"
    npm install -g pnpm || {
      err "pnpm 설치 실패. 권한 문제라면 'sudo npm install -g pnpm' 또는 'brew install pnpm' 으로 수동 설치 후 다시 시도하세요."
      exit 1
    }
  fi
  # PATH에 pnpm 추가 (현재 세션에도)
  export PNPM_HOME="$HOME/.local/share/pnpm"
  export PATH="$PNPM_HOME:$PATH"
fi

# ---------- Clone / Update ----------
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "기존 설치 업데이트 중…"
  cd "$INSTALL_DIR"
  git pull --ff-only origin "$BRANCH" 2>/dev/null || {
    log "pull 실패 — 재설치합니다."
    cd "$HOME"
    rm -rf "$INSTALL_DIR"
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  }
else
  log "Cockpit 설치 중… ($INSTALL_DIR)"
  rm -rf "$INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ---------- 셸 명령어 등록 ----------
SHELL_CMD='alias cockpit="$HOME/.cockpit-app/start.sh"'
SHELL_PROFILE=""

if [[ -n "${ZSH_VERSION:-}" ]] || [[ "$SHELL" == */zsh ]]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [[ -n "${BASH_VERSION:-}" ]] || [[ "$SHELL" == */bash ]]; then
  SHELL_PROFILE="$HOME/.bash_profile"
  [[ -f "$HOME/.bashrc" ]] && SHELL_PROFILE="$HOME/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
  if ! grep -q "cockpit-app/start.sh" "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# Cockpit" >> "$SHELL_PROFILE"
    echo "$SHELL_CMD" >> "$SHELL_PROFILE"
    log "cockpit 명령어를 $SHELL_PROFILE 에 등록했습니다."
  fi
  # 현재 셸에도 즉시 적용
  eval "$SHELL_CMD"
fi

# ---------- macOS 앱 등록 (수동 설치 경로에서만) ----------
# .app 자동설치 경로(COCKPIT_INSTALL_ONLY=1)에선 이미 정식 /Applications/Cockpit.app이 있으므로
# 중복 shell 런처를 만들지 않는다.
if [[ "$(uname)" == "Darwin" ]] && [[ "${COCKPIT_INSTALL_ONLY:-}" != "1" ]]; then
  APP_DIR="$HOME/Applications/Cockpit.app"
  if [[ ! -d "$APP_DIR" ]]; then
    log "macOS 앱으로 등록 중…"
    mkdir -p "$APP_DIR/Contents/MacOS"
    mkdir -p "$APP_DIR/Contents/Resources"

    # 실행 파일
    cat > "$APP_DIR/Contents/MacOS/Cockpit" << 'LAUNCHER'
#!/usr/bin/env bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
cd "$HOME/.cockpit-app"
exec ./start.sh
LAUNCHER
    chmod +x "$APP_DIR/Contents/MacOS/Cockpit"

    # Info.plist
    cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Cockpit</string>
  <key>CFBundleDisplayName</key>
  <string>Cockpit</string>
  <key>CFBundleIdentifier</key>
  <string>dev.cockpit.app</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>Cockpit</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <false/>
</dict>
</plist>
PLIST

    log "Cockpit.app이 ~/Applications에 등록되었습니다."
    log "Launchpad 또는 Spotlight에서 'Cockpit' 검색으로 실행 가능!"
  fi
fi

# ---------- 의존성 + 빌드 ----------
# .app 자동설치 경로(COCKPIT_INSTALL_ONLY=1)에서는 Electron을 띄우지 않고 준비만.
# 일반 curl|bash 경로에서도 build를 미리 해둬 첫 실행 속도를 확보.
log "의존성 설치 중…"
pnpm install

log "Prisma 클라이언트 생성…"
pnpm prisma generate >/dev/null

log "DB 마이그레이션…"
pnpm prisma migrate deploy 2>/dev/null || pnpm prisma migrate dev --name init --skip-seed

log "Next.js 프로덕션 빌드 (1-3분 소요)…"
pnpm build

# ---------- Claude Code MCP 자동 등록 ----------
# claude CLI 가 있으면 Cockpit MCP 서버를 user scope 로 등록.
# 이미 등록돼 있으면 건너뜀 (claude mcp list 로 감지).
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q "^cockpit[[:space:]]"; then
    log "Claude Code MCP: cockpit 이미 등록됨 — 건너뜀"
  else
    MCP_TSX="$INSTALL_DIR/node_modules/.bin/tsx"
    MCP_SERVER="$INSTALL_DIR/mcp/server.ts"
    if [[ -x "$MCP_TSX" ]] && [[ -f "$MCP_SERVER" ]]; then
      log "Claude Code MCP 등록 중…"
      if claude mcp add -s user cockpit "$MCP_TSX" "$MCP_SERVER" >/dev/null 2>&1; then
        log "MCP 등록 완료 — 다른 프로젝트에서 '메모/TODO/오늘 뭐 했지?' 등 요청 시 자동 사용됨"
      else
        log "MCP 등록 실패 (무시) — 나중에 수동 등록 가능:"
        log "  claude mcp add -s user cockpit $MCP_TSX $MCP_SERVER"
      fi
    fi
  fi
fi

# ---------- Claude Code Hook 자동 등록 ----------
# - Stop 훅: v4 부터 no-op (호환 유지용). 과거 사용자 설정에 등록돼 있을 수 있어 유지.
# - SessionEnd 훅: 세션 종료 시 대화 전체를 LLM 으로 한 단락 요약해 cockpit
#   daily.md 에 1건 기록. 의미 없는 세션은 "NONE" 판정으로 스킵.
STOP_HOOK_SCRIPT="$INSTALL_DIR/scripts/claude-stop-hook.sh"
SESSIONEND_HOOK_SCRIPT="$INSTALL_DIR/scripts/claude-sessionend-hook.sh"
SETTINGS_FILE="$HOME/.claude/settings.json"

mkdir -p "$(dirname "$SETTINGS_FILE")"

# Stop 훅 등록 (호환 유지 — 기존 사용자가 활성화 상태였으면 그대로, 아니면 건너뜀은 안 하고 등록)
if [[ -x "$STOP_HOOK_SCRIPT" ]]; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const hookCmd = process.argv[2];
    let s = {};
    try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    s.hooks = s.hooks || {};
    s.hooks.Stop = s.hooks.Stop || [];
    const already = s.hooks.Stop.some(e =>
      (e.hooks || []).some(h => h && h.command && h.command.includes("cockpit-app/scripts/claude-stop-hook.sh"))
    );
    if (already) { console.log("ALREADY"); process.exit(0); }
    s.hooks.Stop.push({
      matcher: "",
      hooks: [{ type: "command", command: hookCmd }]
    });
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
    console.log("ADDED");
  ' "$SETTINGS_FILE" "$STOP_HOOK_SCRIPT" 2>/dev/null | {
    read result
    case "$result" in
      ADDED)   log "Claude Code Stop 훅 등록 완료 (v4: no-op 호환용)" ;;
      ALREADY) log "Claude Code Stop 훅: 이미 등록됨 — 건너뜀" ;;
      *)       log "Claude Code Stop 훅 등록 스킵 (settings.json 처리 실패 — 무시)" ;;
    esac
  }
fi

# PostToolUse(Bash) 훅 등록 — git commit/push 실시간 기록
COMMIT_HOOK_SCRIPT="$INSTALL_DIR/scripts/claude-commit-hook.sh"
if [[ -x "$COMMIT_HOOK_SCRIPT" ]]; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const hookCmd = process.argv[2];
    let s = {};
    try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    s.hooks = s.hooks || {};
    s.hooks.PostToolUse = s.hooks.PostToolUse || [];
    const already = s.hooks.PostToolUse.some(e =>
      (e.hooks || []).some(h => h && h.command && h.command.includes("cockpit-app/scripts/claude-commit-hook.sh"))
    );
    if (already) { console.log("ALREADY"); process.exit(0); }
    s.hooks.PostToolUse.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: hookCmd }]
    });
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
    console.log("ADDED");
  ' "$SETTINGS_FILE" "$COMMIT_HOOK_SCRIPT" 2>/dev/null | {
    read result
    case "$result" in
      ADDED)   log "Claude Code commit 훅 등록 완료 — git commit/push 시 daily.md 에 자동 기록" ;;
      ALREADY) log "Claude Code commit 훅: 이미 등록됨 — 건너뜀" ;;
      *)       log "Claude Code commit 훅 등록 스킵 (settings.json 처리 실패 — 무시)" ;;
    esac
  }
fi

# SessionEnd 훅 등록 — conversation-based recap 이 실제로 동작하는 곳
if [[ -x "$SESSIONEND_HOOK_SCRIPT" ]]; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const hookCmd = process.argv[2];
    let s = {};
    try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    s.hooks = s.hooks || {};
    s.hooks.SessionEnd = s.hooks.SessionEnd || [];
    const already = s.hooks.SessionEnd.some(e =>
      (e.hooks || []).some(h => h && h.command && h.command.includes("cockpit-app/scripts/claude-sessionend-hook.sh"))
    );
    if (already) { console.log("ALREADY"); process.exit(0); }
    s.hooks.SessionEnd.push({
      matcher: "",
      hooks: [{ type: "command", command: hookCmd }]
    });
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
    console.log("ADDED");
  ' "$SETTINGS_FILE" "$SESSIONEND_HOOK_SCRIPT" 2>/dev/null | {
    read result
    case "$result" in
      ADDED)   log "Claude Code SessionEnd 훅 등록 완료 — 세션 종료 시 대화 요약을 daily.md 에 기록" ;;
      ALREADY) log "Claude Code SessionEnd 훅: 이미 등록됨 — 건너뜀" ;;
      *)       log "Claude Code SessionEnd 훅 등록 스킵 (settings.json 처리 실패 — 무시)" ;;
    esac
  }
fi

# ---------- 실행 ----------
log "설치 완료!"

if [[ "${COCKPIT_INSTALL_ONLY:-}" == "1" ]]; then
  log ".app에서 호출됨 — Electron 실행 생략. 메인 앱이 이어서 실행합니다."
  exit 0
fi

echo ""
echo "  ┌──────────────────────────────────────────┐"
echo "  │  새 터미널을 열거나 아래 명령어를 실행:   │"
echo "  │                                          │"
echo "  │    source ~/.zshrc                       │"
echo "  │                                          │"
echo "  │  이후 아무 디렉토리에서:                  │"
echo "  │                                          │"
echo "  │    cockpit          # 데스크탑 앱 실행    │"
echo "  │    cockpit --web    # 웹 버전 (브라우저)  │"
echo "  │    cockpit --stop   # 중지               │"
echo "  └──────────────────────────────────────────┘"
echo ""
log "지금 바로 실행합니다…"
echo ""

exec ./start.sh "$@"
