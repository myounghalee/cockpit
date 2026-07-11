# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Cockpit is

통합 개발 워크벤치 — 터미널·칸반·Git을 한 화면에서. 핵심은 **PDCA 자동화**: 티켓 하나를 Plan → Design → Do → Check → Report 단계로 굴려 코드 구현과 커밋/PR까지 백그라운드에서 Claude CLI가 처리한다. 웹 앱(브라우저)과 Electron 데스크탑 앱 두 형태로 동작하며, 같은 Next.js 서버를 공유한다.

## Commands

```bash
pnpm dev              # 웹 버전 (custom server + HMR, 기본 :8282)
pnpm electron:dev     # Electron 컴파일 후 데스크탑 앱으로 실행
pnpm typecheck        # tsc --noEmit — 커밋 전 필수 (테스트 스위트 없음)
pnpm lint             # ESLint (next lint)
pnpm prisma:migrate   # 스키마 변경 후 마이그레이션 (dev)
pnpm prisma:generate  # Prisma Client 재생성
```

- **테스트 프레임워크가 없다.** 검증은 `pnpm typecheck` + 실제 앱 구동으로 한다.
- `pnpm dev`는 `next dev`가 아니라 `tsx server.ts` (아래 custom server 참조). 순수 Next 명령으로는 WebSocket/PTY가 뜨지 않는다.
- 의존성 설치 시 `postinstall`이 `node-pty` 퍼미션 픽스 + Electron 이름 패치 + `prisma generate`를 자동 수행한다.
- 릴리즈는 `git tag vX.Y.Z && git push origin vX.Y.Z` → GitHub Actions가 .dmg/.exe 빌드 후 Releases 업로드.

## Architecture

### Custom server (`server.ts`)

Next.js를 임베드한 단일 HTTP 서버가 두 가지를 동시에 처리한다:
- **HTTP**: Next가 페이지 + `src/app/api/**/route.ts`를 핸들
- **WebSocket**: `ws` 라이브러리가 `/ws/pty/:id` 업그레이드를 받아 `PtyManager`에 연결 (origin은 동일 호스트만 허용)

`PtyManager` 인스턴스는 `globalThis.__cockpitPtyManager`로 노출된다 — API route(`route.ts`)가 같은 프로세스에서 도는 점을 이용해 PTY에 접근한다. Route에서 터미널 상태를 다뤄야 하면 이 전역을 통해야 한다.

`COCKPIT_PARENT_PID`가 설정되면 3초마다 부모(Electron) 생존을 확인하고, 부모가 죽으면 서버도 종료해 고아 프로세스를 방지한다.

### Terminals (`src/server/`)

- `pty-manager.ts` — 세션의 진실 소스. 각 PTY는 `RingBuffer`(스크롤백)를 두어 **재접속·새로고침 후에도 세션이 살아남는다**. 자식 프로세스를 폴링해 `busy`/`awaitingInput` 상태를 계산하고, OSC 시퀀스로 알림을 파싱한다. onData는 8ms 윈도로 배칭해 브로드캐스트.
- `ws-handler.ts` — WebSocket ↔ PTY 브릿지. `ring-buffer.ts` — 고정 크기 스크롤백 버퍼.
- 클라이언트 측 xterm.js 및 상태는 `src/store/terminal-store.ts`(Zustand)가 split/tab 레이아웃을 관리.

### PDCA automation (칸반 → Claude CLI)

이 코드베이스의 심장. 티켓을 백그라운드 Claude CLI 실행으로 굴린다.

- `src/lib/claude-runner.ts` — 티켓당 하나의 `claude -p` 프로세스를 spawn하고 **stream-json(JSONL)** 을 파싱한다. raw stdout은 로그 파일로, `tool_use` 이벤트는 구조화된 action으로 뽑아 `.actions.jsonl`에 저장. `EventEmitter`로 data/action/exit를 브로드캐스트하고, 프로세스 종료 시 티켓 상태를 자동으로 `review`로 넘긴다. dev hot-reload를 견디도록 `globalThis` 싱글톤으로 캐시.
- `src/lib/pdca-prompts.ts` — 단계 순서(`plan → design → do → check → report`)와 단계별 프롬프트. **스킬/플러그인 설치 없이 동작하도록 각 단계의 역할·산출물을 프롬프트에 inline**한다 (Plan은 요구사항 분석 → `docs/pdca/{id}/plan.md`, Do는 design.md 체크리스트 기반 구현, Check는 갭 분석 + Match Rate 등).
- `src/lib/claude-prompt.ts` — 티켓 컨텍스트로 실제 프롬프트를 조립.
- `Ticket.pdcaStage`가 null이면 일반 티켓, 값이 있으면 PDCA 티켓. `autoMode`(manual/after_plan/full)와 `commitMode`(none/commit/commit_push)가 자동화 범위를 정한다. `sessionId`로 Claude Code 세션을 재사용.
- 관련 API: `src/app/api/tickets/[id]/{run,start,stop,advance-stage,rework,stream,...}/route.ts`.

### Git client (`src/lib/git.ts` + `src/app/api/git/[projectId]/*`)

모든 git 호출은 `execFile`(shell=false)로 실행하고 branch/hash/path를 정규식으로 검증한다 — **shell 인젝션 방지가 설계 제약**이므로 새 git 명령을 추가할 때도 이 패턴을 지켜야 한다(문자열 조립 금지, 인자 배열 + 검증). 커밋 파일 목록은 `--numstat`으로 파싱하고(경로 잘림 방지) 머지 커밋은 `--first-parent`로 표시한다. UI는 `src/components/git/`(diff-viewer, status-panel 등)와 `src/hooks/use-git.ts`.

### Data layer

- **SQLite + Prisma** (`prisma/schema.prisma`, `DATABASE_URL`). 핵심 모델: `Project`(1급 엔티티, 로컬 폴더 경로) → `Ticket`(PDCA), `Memo`(할일/아이디어 메모, 성숙하면 티켓으로 승격), `QuickAction`(커스텀 git 워크플로우), `ProjectFolder`, `Setting`(key-value, Jira/Slack 설정 등).
- `src/lib/prisma.ts`가 클라이언트 싱글톤.

### Frontend

- Next.js 15 App Router. 화면은 `src/app/{terminal,kanban,git,projects,insights,memo,settings,claude}/`, 대응 컴포넌트는 `src/components/<feature>/`.
- 상태: **Zustand**(`src/store/`, 클라이언트 UI/터미널 레이아웃) + **React Query**(`src/hooks/use-*.ts`, 서버 데이터). 이 둘의 역할을 섞지 말 것.
- 스타일: Tailwind CSS 4. 색은 `globals.css`의 CSS 변수(`--color-*`)로 정의된 라이트/다크 토큰을 쓴다 (하드코딩 색상 금지). Electron 창 배경색은 이 변수와 반드시 일치해야 함(`electron/main.ts`의 `BG_DARK`/`BG_LIGHT`).

### Electron (`electron/`)

`main.ts`가 custom server를 자식으로 띄우고 창을 연다. 단일 인스턴스 락(중복 실행 시 기존 창 포커스), 테마 IPC 연동, `COCKPIT_PARENT_PID` 주입으로 서버 생존을 자기 프로세스에 묶는다. `main`/`preload`만 `electron/tsconfig.json`으로 별도 컴파일된다.

### MCP server (`mcp/server.ts`)

Claude Code에서 Cockpit의 메모/티켓/데일리 로그를 네이티브 도구처럼 쓰게 하는 stdio MCP 서버. 실행 중인 Cockpit HTTP API를 호출한다 — base URL은 `COCKPIT_URL` 또는 `~/.cockpit-userdata/last-port`에서 해석(기본 8282).

## Conventions

- 코드 주석과 커밋 메시지는 **한국어**. 커밋은 Conventional Commits (`fix(git): …`, `feat: …`).
- 새 git 서브명령·PTY 처리·API route를 추가할 땐 위의 보안/전역 패턴(execFile 검증, `globalThis` PtyManager)을 따를 것.
- 환경변수: `PORT`(8282), `HOST`(127.0.0.1), `SHELL_PATH`(/bin/zsh), `DEFAULT_CWD`($HOME) — `.env.local`.
