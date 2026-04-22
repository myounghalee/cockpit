# Cockpit 실행 스크립트 (Windows PowerShell)
#
# 사용법:
#   .\start.ps1             # 실행 + 브라우저 오픈
#   .\start.ps1 --stop      # 중지
#
param([string]$Action = "")

$ErrorActionPreference = "Stop"
$PidFile = ".cockpit.pid"
$LogDir = "logs"
$LogFile = "$LogDir\cockpit.log"
$Port = if ($env:PORT) { $env:PORT } else { "8282" }
$Host_ = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }

function Log($msg) { Write-Host "[cockpit] $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "[cockpit] $msg" -ForegroundColor Yellow }
function Err($msg) { Write-Host "[cockpit] $msg" -ForegroundColor Red }

# ---------- stop ----------
if ($Action -eq "--stop") {
    if (Test-Path $PidFile) {
        $pid = Get-Content $PidFile
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Log "중지됨 (pid=$pid)"
        } catch {
            Warn "프로세스를 찾을 수 없습니다."
        }
        Remove-Item $PidFile -Force
    } else {
        Warn "실행 중인 Cockpit이 없습니다."
    }
    exit 0
}

# ---------- Node.js 체크 ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Err "Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 Node 20+ 설치하세요."
    exit 1
}

$nodeMajor = (node -p "process.versions.node.split('.')[0]")
if ([int]$nodeMajor -lt 20) {
    Err "Node 20 이상이 필요합니다. 현재: $(node -v)"
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Warn "pnpm 설치 중…"
    npm install -g pnpm
}

# ---------- 이미 실행 중? ----------
if (Test-Path $PidFile) {
    $existingPid = Get-Content $PidFile
    try {
        $proc = Get-Process -Id $existingPid -ErrorAction Stop
        Log "Cockpit이 이미 실행 중입니다 (pid=$existingPid)"
        Start-Process "http://${Host_}:${Port}"
        exit 0
    } catch {
        Remove-Item $PidFile -Force
    }
}

# ---------- auto update ----------
if (Test-Path ".git") {
    Log "최신 버전 확인 중…"
    git fetch origin main --quiet 2>$null
    $local = git rev-parse HEAD 2>$null
    $remote = git rev-parse origin/main 2>$null
    if ($local -ne $remote) {
        Log "업데이트 발견! 적용 중…"
        git pull --ff-only origin main 2>$null
        pnpm install 2>$null
        pnpm prisma generate 2>$null
        pnpm prisma migrate deploy 2>$null
        Log "업데이트 적용 완료!"
    } else {
        Log "최신 버전입니다."
    }
}

# ---------- 의존성 ----------
if (-not (Test-Path "node_modules")) {
    Log "의존성 설치 중…"
    pnpm install
}

# ---------- Prisma ----------
Log "Prisma 준비 중…"
pnpm prisma generate 2>$null
pnpm prisma migrate deploy 2>$null

# ---------- 실행 ----------
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Log "실행합니다 (http://${Host_}:${Port})"
$process = Start-Process -FilePath "pnpm" -ArgumentList "dev" -PassThru -NoNewWindow -RedirectStandardOutput $LogFile -RedirectStandardError "$LogDir\cockpit-err.log"
$process.Id | Out-File $PidFile -Encoding ascii

# 서버 기동 대기
Log "기동 대기 중…"
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri "http://${Host_}:${Port}/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Log "준비 완료! 브라우저를 엽니다."
            Start-Process "http://${Host_}:${Port}"
            Log "로그: Get-Content $LogFile -Wait"
            Log "중지: .\start.ps1 --stop"
            exit 0
        }
    } catch {
        # 아직 기동 중
    }
}

Err "서버가 30초 안에 응답하지 않았습니다. 로그 확인: $LogFile"
exit 1
