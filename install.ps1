# Cockpit 설치 스크립트 (Windows PowerShell)
# 사용법: irm https://raw.githubusercontent.com/myounghalee/cockpit/main/install.ps1 | iex
#
# 하는 일:
# 1. ~/.cockpit-app 에 clone (이미 있으면 pull)
# 2. cockpit 함수를 PowerShell 프로파일에 등록
# 3. 바로 실행

$ErrorActionPreference = "Stop"
$InstallDir = "$env:USERPROFILE\.cockpit-app"
$Repo = "https://github.com/myounghalee/cockpit.git"

function Log($msg) { Write-Host "[cockpit] $msg" -ForegroundColor Cyan }
function Err($msg) { Write-Host "[cockpit] $msg" -ForegroundColor Red }

# ---------- Node.js 체크 ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Err "Node.js가 필요합니다. https://nodejs.org 에서 Node 20+ 설치 후 다시 시도하세요."
    exit 1
}

$nodeMajor = (node -p "process.versions.node.split('.')[0]")
if ([int]$nodeMajor -lt 20) {
    Err "Node 20 이상이 필요합니다. 현재: $(node -v)"
    exit 1
}

# ---------- pnpm 체크 ----------
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Log "pnpm 설치 중…"
    npm install -g pnpm
}

# ---------- Clone / Update ----------
if (Test-Path "$InstallDir\.git") {
    Log "기존 설치 업데이트 중…"
    Push-Location $InstallDir
    git pull --ff-only origin main 2>$null
    if ($LASTEXITCODE -ne 0) {
        Log "pull 실패 — 재설치합니다."
        Pop-Location
        Remove-Item $InstallDir -Recurse -Force
        git clone $Repo $InstallDir
        Push-Location $InstallDir
    }
} else {
    Log "Cockpit 설치 중… ($InstallDir)"
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    git clone $Repo $InstallDir
    Push-Location $InstallDir
}

# ---------- PowerShell 프로파일에 함수 등록 ----------
$FuncDef = @"

# Cockpit
function cockpit { param([string]`$a) Push-Location `$env:USERPROFILE\.cockpit-app; .\start.ps1 `$a; Pop-Location }
"@

$ProfilePath = $PROFILE.CurrentUserAllHosts
if (-not (Test-Path $ProfilePath)) {
    New-Item -ItemType File -Path $ProfilePath -Force | Out-Null
}

$profileContent = Get-Content $ProfilePath -Raw -ErrorAction SilentlyContinue
if ($profileContent -notmatch "cockpit-app") {
    Add-Content $ProfilePath $FuncDef
    Log "cockpit 명령어를 PowerShell 프로파일에 등록했습니다."
}

# 현재 세션에도 적용
Invoke-Expression $FuncDef

# ---------- 실행 ----------
Log "설치 완료!"
Write-Host ""
Write-Host "  다음부터는 아무 디렉토리에서나:"
Write-Host ""
Write-Host "    cockpit          # 실행" -ForegroundColor Green
Write-Host "    cockpit --stop   # 중지" -ForegroundColor Green
Write-Host ""

& .\start.ps1

Pop-Location
