#!/usr/bin/env bash
# Cockpit macOS 원클릭 설치 스크립트
#
# 사용법:
#   curl -fsSL https://raw.githubusercontent.com/myounghalee/cockpit/main/scripts/install-macos.sh | bash
#
# 하는 일:
#   1. 아키텍처(arm64/x86_64) 감지
#   2. Node.js 20+ 체크 (없으면 설치 안내 후 종료)
#   3. GitHub latest release에서 맞는 DMG 다운로드
#   4. /Applications/Cockpit.app 에 설치
#   5. Gatekeeper "손상" 경고 제거 (xattr -cr)
#   6. 앱 실행 → 앱이 ~/.cockpit-app 자동 설치 진행
set -euo pipefail

REPO="myounghalee/cockpit"

# ─── helpers ──────────────────────────────────────────────────
log() { printf "\033[1;34m[cockpit]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[cockpit]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[cockpit]\033[0m %s\n" "$*" >&2; }

# ─── 0. macOS 확인 ────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  err "이 스크립트는 macOS 전용입니다."
  exit 1
fi

# ─── 1. 아키텍처 감지 ─────────────────────────────────────────
ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  DMG_SUFFIX="arm64.dmg"
  log "감지된 아키텍처: Apple Silicon ($ARCH)"
else
  DMG_SUFFIX=".dmg"
  log "감지된 아키텍처: Intel ($ARCH)"
fi

# ─── 2. Node.js 체크 — 없으면 nvm으로 자동 설치 ───────────────
need_install_node=0
if ! command -v node >/dev/null 2>&1; then
  log "Node.js가 설치되어 있지 않습니다. nvm으로 자동 설치합니다…"
  need_install_node=1
else
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    warn "Node $(node -v) 감지됨 (Node 20+ 필요). 최신 LTS를 추가 설치합니다."
    need_install_node=1
  fi
fi

if [[ "$need_install_node" == "1" ]]; then
  # nvm 설치 (없을 때만) — 비밀번호 불필요, 사용자 홈(~/.nvm)에만 설치
  if [[ ! -s "$HOME/.nvm/nvm.sh" ]]; then
    log "nvm 설치 중…"
    curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi

  # 현재 쉘에 nvm 로드
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"

  log "Node.js 20 LTS 설치 중 (1-2분)…"
  nvm install --lts=iron >/dev/null
  nvm alias default lts/iron >/dev/null

  # 현재 프로세스 PATH에 추가 — 이후 node 명령이 바로 동작하도록
  export PATH="$NVM_DIR/versions/node/$(nvm version)/bin:$PATH"

  log "Node.js $(node -v) 설치 완료"
fi
log "Node.js $(node -v) 확인됨"

# ─── 3. 최신 DMG URL 조회 ─────────────────────────────────────
# GitHub API로 latest release의 assets에서 DMG 찾기 (버전 하드코딩 없이 항상 최신)
log "최신 릴리스 정보 조회 중…"
API_URL="https://api.github.com/repos/$REPO/releases/latest"
ASSET_URL="$(curl -fsSL "$API_URL" 2>/dev/null \
  | grep "browser_download_url" \
  | grep "$DMG_SUFFIX\"" \
  | head -1 \
  | sed -E 's/.*"(https[^"]+)".*/\1/')"

if [[ -z "${ASSET_URL:-}" ]]; then
  # API 레이트리밋 등으로 실패 시 fallback — latest 태그 redirect 사용
  warn "API 조회 실패, latest redirect로 fallback"
  # 파일명은 알 수 없으므로 가장 가능성 높은 후보로 시도 (arm64는 Cockpit-*-arm64.dmg 규칙)
  err "DMG URL을 찾을 수 없습니다. GitHub 저장소를 직접 확인해주세요:"
  echo "  https://github.com/$REPO/releases/latest"
  exit 1
fi

log "DMG URL: $ASSET_URL"

# ─── 4. 다운로드 ──────────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
DMG_PATH="$TMP_DIR/cockpit.dmg"

log "DMG 다운로드 중… (100MB+)"
curl -fL --progress-bar -o "$DMG_PATH" "$ASSET_URL"

# ─── 5. 기존 앱 제거 (업데이트 대응) ──────────────────────────
if [[ -d "/Applications/Cockpit.app" ]]; then
  log "기존 Cockpit.app 제거 중…"
  # 실행 중이면 먼저 종료
  pkill -f "Cockpit.app/Contents/MacOS/Cockpit" 2>/dev/null || true
  sleep 1
  rm -rf "/Applications/Cockpit.app"
fi

# ─── 6. 마운트 + 복사 + 언마운트 ──────────────────────────────
log "DMG 마운트…"
# -quiet 빼야 마운트 포인트 파싱 가능. awk 대신 grep -o로 /Volumes/ 경로 추출(공백 포함 안전).
ATTACH_OUT="$(hdiutil attach -nobrowse "$DMG_PATH" 2>&1)"
MOUNT_POINT="$(echo "$ATTACH_OUT" | grep -o '/Volumes/[^[:cntrl:]]*' | tail -1)"
if [[ -z "${MOUNT_POINT:-}" || ! -d "$MOUNT_POINT" ]]; then
  err "마운트 실패:"
  echo "$ATTACH_OUT"
  exit 1
fi
log "마운트 위치: $MOUNT_POINT"

if [[ ! -d "$MOUNT_POINT/Cockpit.app" ]]; then
  err "DMG 안에 Cockpit.app이 없습니다."
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  exit 1
fi

log "/Applications/에 복사…"
cp -R "$MOUNT_POINT/Cockpit.app" "/Applications/"

log "DMG 언마운트…"
hdiutil detach "$MOUNT_POINT" -quiet

# ─── 7. Gatekeeper 우회 (서명/공증 없는 앱용) ─────────────────
log "Gatekeeper quarantine 속성 제거…"
xattr -cr "/Applications/Cockpit.app" 2>/dev/null || true

# ─── 8. 앱 실행 ───────────────────────────────────────────────
# COCKPIT_NO_AUTO_OPEN=1 이면 자동 실행 skip (배포 스크립트 등에서
# .next 재빌드 후 수동 open 하려는 경우 race condition 방지용)
if [[ "${COCKPIT_NO_AUTO_OPEN:-0}" == "1" ]]; then
  log "자동 실행 skip (COCKPIT_NO_AUTO_OPEN=1)"
else
  log "Cockpit 실행…"
  open "/Applications/Cockpit.app"
fi

echo ""
log "✅ 설치 완료!"
echo ""
echo "  첫 실행 시 'Cockpit 소스를 설치하시겠습니까?' 다이얼로그가 뜨면 '설치'를 눌러주세요."
echo "  (~/.cockpit-app 에 소스를 자동으로 받아옵니다. 2-5분 소요)"
echo ""
echo "  이후엔 Launchpad/Spotlight에서 'Cockpit' 검색으로 실행하세요."
echo ""
