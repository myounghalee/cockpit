# Cockpit

**통합 개발 워크벤치** — 터미널, 칸반, Git을 한 화면에서.

Claude Code를 중심에 둔 **PDCA 자동화 워크벤치** — 티켓 하나를 Plan → Do → Check → Act로 굴려 PR까지 만들어줍니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![macOS](https://img.shields.io/badge/macOS-arm64%20%7C%20x64-black)](https://github.com/myounghalee/cockpit/releases/latest)
[![GitHub stars](https://img.shields.io/github/stars/myounghalee/cockpit?style=social)](https://github.com/myounghalee/cockpit)

> 📖 **공식 사이트 / 상세 가이드**: <https://myounghalee.github.io/cockpit/>
>
> **한 줄 설치 (macOS):**
> ```bash
> curl -fsSL https://github.com/myounghalee/cockpit/releases/latest/download/install-macos.sh | bash
> ```

---

## 기능

- **프로젝트 허브** — 로컬 폴더를 프로젝트로 등록, 폴더 그룹, 즐겨찾기, 파일 트리/뷰어
- **분할 터미널** — xterm.js + node-pty 기반 실제 PTY. 좌우/상하 분할, 멀티 탭, 세션 영속화
- **칸반 보드** — 프로젝트별/전체 보기, Jira 연동, 실행 중 뱃지, 결과 요약, 미해결 이슈 패널
- **Git 클라이언트** — 커밋 그래프, diff, 스테이징, 커밋, push/pull, merge/rebase, stash, Quick Actions
- **Jira 연동** — 이슈 검색/임포트, 상태 자동 전환, 미해결 이슈 사이드 패널
- **데스크탑 앱** — Electron 패키징 (.dmg / .exe), 자동 업데이트

---

## 설치

### 방법 1: 데스크탑 앱 (권장)

[Releases 페이지](https://github.com/myounghalee/cockpit/releases)에서 다운로드:

| OS | 파일 |
|----|------|
| Mac | `Cockpit-x.x.x-arm64.dmg` |
| Windows | `Cockpit-Setup-x.x.x.exe` |

> **Mac 첫 실행 시** "확인되지 않은 개발자" 경고가 뜨면:
> ```bash
> xattr -cr /Applications/Cockpit.app
> ```
>
> **Windows 첫 실행 시** "Windows가 PC를 보호했습니다" → **추가 정보** → **실행** 클릭

앱 시작 시 새 버전이 있으면 자동 업데이트됩니다.

### 방법 2: 원라이너 설치 (Node.js 필요)

**Mac / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/myounghalee/cockpit/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/myounghalee/cockpit/main/install.ps1 | iex
```

설치 후 어디서든:
```
cockpit          # 실행 (자동 업데이트 + 브라우저 오픈)
cockpit --stop   # 중지
cockpit --fg     # 포그라운드 실행
```

### 방법 3: 직접 clone

```bash
git clone https://github.com/myounghalee/cockpit.git
cd cockpit
./start.sh
```

### 요구사항 (방법 2, 3)

- **Node.js 20+**
- **pnpm** (없으면 자동 설치)

---

## 사용법

### 프로젝트

1. `/projects`에서 로컬 폴더를 프로젝트로 등록
2. 프로젝트 클릭 → 터미널/칸반/Git 바로 이동
3. 사이드바 하단 "Active" 배지로 활성 프로젝트 전환

### 터미널

- `Cmd+T` 새 탭, `Cmd+W` 탭 닫기
- 패널 헤더의 분할 버튼으로 좌우/상하 분할
- 새로고침/페이지 이동해도 세션 유지

### 칸반

- 드래그앤드롭으로 티켓 이동 (Backlog → In Progress → Review → Done)
- "실행" 클릭 → Claude CLI가 터미널에서 자동 실행
- 터미널 탭 닫으면 → 자동으로 Review로 이동
- 상단 드롭다운으로 전체/프로젝트별 보기 전환
- 우측 Jira 패널에서 미해결 이슈 바로 임포트

### Git

- 커밋 그래프 (전체/현재 브랜치 토글)
- 파일별 스테이징/언스테이징/폐기
- Push/Pull/Fetch + Merge/Rebase/Abort
- Stash 저장/적용/삭제
- Quick Actions — 커스텀 워크플로우 (예: Fetch → Pull --rebase → Push)

### 설정

- `/settings`에서 Jira 연동 설정 (Host, Email, API Token)
- API Token: [Atlassian 계정 설정 → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)에서 생성

---

## 환경 변수 (`.env.local`)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `4000` | HTTP/WebSocket 포트 |
| `HOST` | `127.0.0.1` | 바인딩 주소 |
| `SHELL_PATH` | `/bin/zsh` | 기본 셸 |
| `DEFAULT_CWD` | `$HOME` | 기본 작업 디렉토리 |

---

## 개발

```bash
pnpm dev              # 웹 버전 실행 (HMR)
pnpm electron:dev     # 데스크탑 앱으로 실행
pnpm typecheck        # 타입 체크
pnpm lint             # ESLint
pnpm prisma:migrate   # DB 마이그레이션
```

### 릴리즈

```bash
# package.json version 수정 후
git tag v1.x.x
git push origin v1.x.x
# → GitHub Actions가 자동으로 .dmg + .exe 빌드 → Releases에 업로드
```

---

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| Mac "확인되지 않은 개발자" | `xattr -cr /Applications/Cockpit.app` |
| Windows SmartScreen 경고 | "추가 정보" → "실행" |
| 포트 충돌 | `PORT=4001 ./start.sh` |
| node-pty 설치 실패 | Mac: `xcode-select --install` / Linux: `apt install build-essential` |

---

## 기술 스택

| 영역 | 라이브러리 |
|------|-----------|
| 프레임워크 | Next.js 15 + custom server |
| UI | React 19, TypeScript, Tailwind CSS 4 |
| 터미널 | xterm.js + node-pty + WebSocket |
| 칸반 | @dnd-kit (드래그앤드롭) |
| Git | execFile (shell=false, 보안) |
| 상태 | Zustand + React Query |
| DB | SQLite + Prisma |
| 데스크탑 | Electron + electron-updater |

---

## 라이선스

MIT License. 자유롭게 쓰시고, 개선 제안/PR 환영합니다.

---

Made with ❤️ by a solo developer.
If Cockpit saves you an hour, consider [buying me a coffee ☕](https://buymeacoffee.com/myounghalee) or [sponsoring on GitHub](https://github.com/sponsors/myounghalee).
