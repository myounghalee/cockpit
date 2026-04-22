/**
 * PDCA 단계별 프롬프트 생성.
 *
 * 스킬/플러그인 설치 없이도 동작하도록 각 단계에 필요한 역할·관점·산출물을 inline으로 포함한다.
 * - Plan: 요구사항 분석가 역할 → docs/pdca/{id}/plan.md 작성
 * - Design: API/엔터티 설계자 역할 → design.md 작성 (plan.md 참조)
 * - Do: 개발자 역할 → design.md 체크리스트 기반 코드 구현
 * - Check: 갭 분석가 + 코드 리뷰어 역할 → analysis.md + Match Rate
 * - Report: 문서 작성가 역할 → report.md 작성 + 총괄
 */

export type PdcaStage = "plan" | "design" | "do" | "check" | "report";

export const PDCA_STAGE_ORDER: PdcaStage[] = [
  "plan",
  "design",
  "do",
  "check",
  "report",
];

export const PDCA_STAGE_LABEL: Record<PdcaStage, string> = {
  plan: "Plan",
  design: "Design",
  do: "Do",
  check: "Check",
  report: "Report",
};

export function nextPdcaStage(stage: PdcaStage): PdcaStage | null {
  const idx = PDCA_STAGE_ORDER.indexOf(stage);
  if (idx === -1 || idx === PDCA_STAGE_ORDER.length - 1) return null;
  return PDCA_STAGE_ORDER[idx + 1];
}

export interface PdcaPromptContext {
  ticketId: string;
  title: string;
  description?: string | null;
  successCriteria?: string | null;
  jiraKey?: string | null;
  lastReworkRequest?: string | null;
}

const PDCA_DOC_DIR = (ticketId: string, jiraKey?: string | null) =>
  `docs/pdca/${jiraKey ?? ticketId}`;

function header(ctx: PdcaPromptContext, stage: PdcaStage): string {
  const parts: string[] = [];
  parts.push(`# PDCA ${PDCA_STAGE_LABEL[stage]} — ${ctx.title}`);
  if (ctx.jiraKey) parts.push(`(Jira: ${ctx.jiraKey})`);
  if (ctx.description?.trim()) {
    parts.push(`\n## 요청 내용\n${ctx.description.trim()}`);
  }
  if (ctx.successCriteria?.trim()) {
    parts.push(`\n## 성공 기준\n${ctx.successCriteria.trim()}`);
  }
  if (ctx.lastReworkRequest?.trim()) {
    parts.push(`\n## 재작업 요청\n${ctx.lastReworkRequest.trim()}`);
  }
  return parts.join("\n");
}

function planPrompt(ctx: PdcaPromptContext): string {
  const dir = PDCA_DOC_DIR(ctx.ticketId, ctx.jiraKey);
  return `${header(ctx, "plan")}

## 역할
당신은 **요구사항 분석가**입니다. 구현을 시작하기 전에 요청을 면밀히 읽고, 무엇을 왜 어떻게 할지 합의 가능한 수준으로 정리합니다.

## 참조할 것
- 프로젝트 루트에 \`docs/domain/_index.md\`가 있으면 읽고, 이번 요청과 관련된 서브도메인 파일을 로드합니다.
- 프로젝트 컨벤션 문서(\`CLAUDE.md\`, \`docs/code-convention.md\` 등)가 있으면 훑어보세요.

## 해야 할 일
1. 요구사항을 분석하고, 모호하거나 부족한 부분이 있으면 **plan.md 작성 전에** 사용자에게 질문하세요.
2. 범위를 명확히 정의하세요 — 포함할 것과 포함하지 않을 것을 구분합니다.
3. 변경이 미칠 영향 범위를 식별하세요 (API, 데이터, UI, 호환성 등).
4. \`${dir}/plan.md\` 파일을 다음 섹션 구조로 작성하세요:
   - ## 배경 / 문제 정의
   - ## 목표 / 성공 기준
   - ## 범위 (In-scope / Out-of-scope)
   - ## 제약 사항 / 영향 범위
   - ## 접근 방안 (선택지 비교가 있으면 함께)
   - ## 오픈 질문 (남은 불확실성)

## 중단 조건
- plan.md 작성 완료 후 **여기서 멈추고** 사용자 승인을 기다리세요.
- 설계/구현/테스트 작업은 이번 단계에서 수행하지 않습니다.
- Git 커밋하지 마세요.

## 완료 후
마지막에 plan.md의 핵심을 3-5줄로 요약하여 출력하세요.`;
}

function designPrompt(ctx: PdcaPromptContext): string {
  const dir = PDCA_DOC_DIR(ctx.ticketId, ctx.jiraKey);
  return `${header(ctx, "design")}

## 역할
당신은 **기술 설계자**입니다. plan.md에서 합의된 요구사항을 받아 구현 가능한 수준으로 API/데이터/아키텍처를 설계합니다.

## 전제
- \`${dir}/plan.md\`가 존재하며 승인된 상태입니다. 먼저 이 파일을 읽고 요구사항을 정확히 파악하세요.
- plan.md에 없는 범위는 임의로 추가하지 마세요.

## 참조할 것
- 관련 \`docs/domain/{subdomain}.md\` — 용어, 상태 흐름, 업무 규칙
- 기존 코드베이스의 유사 기능 — 패턴과 컨벤션 일관성

## 해야 할 일
1. plan.md의 "접근 방안"을 읽고 구체적인 기술 설계로 풀어내세요.
2. 필요한 API/엔터티/스키마 변경을 명세하세요.
3. 구현 체크리스트(작업 단위 리스트)를 작성하세요 — Do 단계에서 그대로 사용됩니다.
4. \`${dir}/design.md\` 파일을 다음 섹션 구조로 작성하세요:
   - ## 아키텍처 개요
   - ## 데이터 모델 변경 (DB/스키마)
   - ## API 명세 (엔드포인트, 요청/응답)
   - ## UI/UX 변경 (해당 시)
   - ## 구현 체크리스트 (Do 단계에서 하나씩 체크)
   - ## 테스트 전략

## 구현 체크리스트 포맷 (중요)
칸반 UI가 자동으로 파싱합니다. 반드시 아래 형식을 지켜주세요:
\`\`\`
## 구현 체크리스트
- [ ] 구체적이고 검증 가능한 작업 단위 (예: "POST /api/xxx 엔드포인트 추가")
- [ ] 또 다른 작업
- [ ] ...
\`\`\`
- 항목은 한 줄로, 명사형 또는 명령형으로 간결하게 작성합니다.
- 한 항목은 30-60분 내 완료 가능한 크기로 쪼개세요.

## 중단 조건
- design.md 작성 완료 후 멈추세요. 코드 구현은 Do 단계에서 합니다.
- Git 커밋하지 마세요.`;
}

function doPrompt(ctx: PdcaPromptContext): string {
  const dir = PDCA_DOC_DIR(ctx.ticketId, ctx.jiraKey);
  return `${header(ctx, "do")}

## 역할
당신은 **개발자**입니다. design.md의 체크리스트를 하나씩 구현합니다. 백엔드/프론트엔드가 혼재된 경우 영역별로 논리적 순서를 따르세요.

## 전제
- \`${dir}/design.md\`가 존재합니다. 먼저 읽고 구현 체크리스트를 파악하세요.
- plan.md에 없는 범위는 구현하지 마세요. 필요하면 멈추고 사용자에게 확인하세요.

## 구현 원칙
- 요청된 범위만 변경하고, 인접 코드를 "개선"하지 마세요.
- 가장 단순한 방법으로 구현하세요. 불필요한 추상화·유연성·옵션을 추가하지 마세요.
- 기존 코드 스타일과 패턴을 따르세요.
- 불확실하면 추측하지 말고 가정을 명시하세요.
- 체크리스트 항목 하나를 완료할 때마다 어떤 파일을 수정했는지 간결히 보고하세요.

## 체크리스트 진행 기록 (필수)
- 체크리스트 항목 하나를 **완료할 때마다 즉시** \`${dir}/design.md\`를 열어 해당 항목의 \`- [ ]\`를 \`- [x]\`로 업데이트하세요.
- 이는 칸반 UI의 실시간 진행률 표시를 위한 것입니다. 한 번에 여러 개 묶어서 체크하지 말고, **하나 끝날 때마다 갱신**하세요.
- 체크리스트 텍스트 자체는 수정하지 마세요 (파싱 대상입니다). \`[ ]\` → \`[x]\` 문자만 바꾸세요.

## 중단 조건
- 체크리스트의 모든 항목 구현 완료 시 멈추세요.
- Git 커밋하지 마세요 (Check 단계에서 검증 후 사용자가 결정).

## 완료 후
수정한 파일 목록과 각 변경의 요지를 요약하세요.`;
}

function checkPrompt(ctx: PdcaPromptContext): string {
  const dir = PDCA_DOC_DIR(ctx.ticketId, ctx.jiraKey);
  return `${header(ctx, "check")}

## 역할
당신은 **갭 분석가 + 코드 리뷰어**입니다. 설계 대비 구현의 완성도를 객관적으로 평가합니다.

## 전제
- \`${dir}/plan.md\`, \`${dir}/design.md\`가 존재합니다. 두 파일과 실제 구현 코드를 비교하세요.

## 해야 할 일
1. **갭 분석**: design.md의 체크리스트 항목 중 구현된 것/누락된 것을 식별하세요.
   - Match Rate (%) = (구현된 항목 수 / 전체 항목 수) × 100
2. **코드 리뷰**: 컨벤션·보안·성능 관점에서 이슈를 점검하세요.
   - Critical / Major / Minor로 분류합니다.
3. **런타임 검증** (가능한 경우): 타입체크/빌드/테스트를 실행하여 깨지는 곳이 없는지 확인하세요.
4. \`${dir}/analysis.md\` 파일을 다음 섹션 구조로 작성하세요:
   - ## Match Rate
   - ## 미구현 항목 (있다면 원인과 함께)
   - ## 코드 리뷰 이슈 (Critical/Major/Minor)
   - ## 런타임 검증 결과
   - ## 권고사항

## 중단 조건
- analysis.md 작성 완료 후 멈추세요.
- Match Rate가 낮거나 Critical 이슈가 있으면 사용자에게 알리세요 — 사용자가 수정을 지시하면 관련 파일을 수정할 수 있습니다.
- Git 커밋하지 마세요.

## 완료 후
Match Rate와 Critical/Major 이슈 수를 한 줄로 요약 출력하세요.`;
}

function reportPrompt(ctx: PdcaPromptContext): string {
  const dir = PDCA_DOC_DIR(ctx.ticketId, ctx.jiraKey);
  return `${header(ctx, "report")}

## 역할
당신은 **문서 작성가**입니다. plan/design/analysis를 종합하여 변경 이력으로 남을 최종 보고서를 작성합니다.

## 전제
- \`${dir}/plan.md\`, \`${dir}/design.md\`, \`${dir}/analysis.md\`를 모두 참조합니다.

## 해야 할 일
1. \`${dir}/report.md\`를 다음 섹션 구조로 작성하세요:
   - ## 배경 / 목표
   - ## 변경 요약 (TL;DR)
   - ## 구현 내용 (주요 변경 파일과 요지)
   - ## 검증 결과 (Match Rate, 리뷰 이슈, 테스트)
   - ## 남은 이슈 / 후속 작업
   - **## 커밋 메시지** — 아래 "고정 포맷" 섹션 참고
2. 커밋 메시지는 cockpit이 자동 커밋 시 그대로 추출해 사용합니다.

## 커밋 메시지 섹션 — 고정 포맷 (중요)
칸반 UI가 이 섹션을 정규식으로 파싱합니다. 반드시 아래 형태를 지키세요:

\`\`\`
## 커밋 메시지

<제목 한 줄: Conventional Commits 형식 권장, 예: feat: 로그인 OTP 추가>

<본문: 1-3 문단. 왜(why) 중심. 파일 나열 금지>
\`\`\`

- 제목과 본문 사이에 빈 줄 **하나**
- 제목 뒤·본문 앞·본문 뒤에는 별도 마크다운 형식(코드블록, 리스트) 금지
- 이 섹션의 첫 비어있지 않은 블록이 제목, 나머지가 본문으로 취급됨

## 중단 조건
- report.md 작성 완료 후 멈추세요.
- 사용자 승인 없이 커밋/푸시하지 마세요 (cockpit이 옵션에 따라 자동 수행).

## 완료 후
보고서 TL;DR 3-5줄 + 제안 커밋 메시지를 출력하세요.`;
}

export function buildPdcaPrompt(
  ctx: PdcaPromptContext,
  stage: PdcaStage,
): string {
  switch (stage) {
    case "plan":
      return planPrompt(ctx);
    case "design":
      return designPrompt(ctx);
    case "do":
      return doPrompt(ctx);
    case "check":
      return checkPrompt(ctx);
    case "report":
      return reportPrompt(ctx);
  }
}
