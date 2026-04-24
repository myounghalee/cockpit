/**
 * Digest → AI 주간 정리.
 *
 * buildDigest() 결과 + 기간 내 daily.md 본문을 컨텍스트로 모아 `claude -p` 에
 * 넘기고, 고정된 템플릿(하이라이트 / 프로젝트별 진행 / 지표 / 다음 주 포커스)으로
 * 마크다운 요약을 생성한다.
 */
import { spawn } from "child_process";
import { buildDigest, type DigestResult } from "@/lib/digest";
import { readDailyFile } from "@/lib/daily-log";

export interface DigestSummaryResult {
  rangeDays: number;
  from: string;
  to: string;
  markdown: string;
  digest: DigestResult;
}

function rangeLabel(days: number): string {
  if (days <= 7) return "이번 주";
  if (days <= 14) return "지난 2주";
  if (days <= 31) return "이번 달";
  return `최근 ${days}일`;
}

const PROMPT_HEADER = `당신은 개발자의 회고를 돕는 리서처입니다. 아래 데이터(커밋/Claude Code 세션/daily 로그)를 바탕으로 사용자가 한 일을 한국어 마크다운으로 정리하세요.

## 출력 규칙 (엄격히)

- 아래 섹션 순서·헤딩을 그대로 사용하세요.
- 데이터에 없는 프로젝트/작업을 추측해서 만들지 마세요.
- 도구 이름(Edit/Write/MCP/Bash 등)은 언급하지 마세요.
- 프로젝트별 진행은 **커밋 또는 Claude 세션이 있는 프로젝트만** 다룹니다. 모두 나열하지 말고 활동량이 많은 프로젝트 우선.
- 각 섹션이 데이터 부족으로 의미 없으면 생략 가능. 단 "하이라이트" 와 "지표" 는 항상 출력.

## 출력 형식

### 하이라이트
- (이 기간에 가장 의미 있는 성과/결정/변화를 3~5개 불릿. 각 1~2문장)

### 프로젝트별 진행

**{프로젝트명}**
- (어떤 기능/버그/문서/설계를 다뤘는지 2~4문장. 커밋 제목과 daily 로그를 근거로 작성)

(활동이 있는 프로젝트만 반복. 활동량 많은 순)

### 지표
- 커밋 {N}건 · {M}개 프로젝트
- Claude Code 세션 {N}회 · {M}개 프로젝트
- Daily 기록 {N}일

### 다음 주 포커스
- (미완료/진행 중으로 보이는 작업이 있으면 1~3개 불릿. 없거나 불분명하면 이 섹션 생략)

---
데이터:
`;

function buildContext(digest: DigestResult): string {
  const parts: string[] = [];

  parts.push(`## 기간: ${digest.from.slice(0, 10)} ~ ${digest.to.slice(0, 10)} (${digest.rangeDays}일)`);
  parts.push(`git email: ${digest.gitEmail ?? "(미설정)"}`);
  parts.push("");

  // 커밋
  parts.push(`## 프로젝트별 커밋 (총 ${digest.totalCommits}건)`);
  if (digest.commitsByProject.length === 0) {
    parts.push("(없음)");
  } else {
    for (const p of digest.commitsByProject) {
      parts.push(`\n### ${p.projectName} (${p.commits.length}건)`);
      // 커밋이 많으면 최대 30개까지
      const commits = p.commits.slice(0, 30);
      for (const c of commits) {
        parts.push(`- ${c.date.slice(0, 10)} ${c.subject}`);
      }
      if (p.commits.length > 30) {
        parts.push(`  ... (외 ${p.commits.length - 30}건)`);
      }
    }
  }
  parts.push("");

  // Claude 세션 분포
  parts.push(`## Claude Code 세션 분포 (총 ${digest.sessionCount}회)`);
  if (digest.sessionsByProject.length === 0) {
    parts.push("(없음)");
  } else {
    for (const s of digest.sessionsByProject) {
      parts.push(`- ${s.projectName}: ${s.count}회`);
    }
  }
  parts.push("");

  // Daily 로그 본문 (최근 10일까지만)
  parts.push(`## Daily 로그 (${digest.dailyDates.length}일)`);
  if (digest.dailyDates.length === 0) {
    parts.push("(없음)");
  } else {
    const sample = digest.dailyDates.slice(0, 10);
    for (const date of sample) {
      const content = readDailyFile(date);
      if (!content) continue;
      parts.push(`\n### ${date}`);
      // 헤더 `# YYYY-MM-DD\n\n` 제거, 2KB 로 절단
      const body = content.replace(/^#\s+\d{4}-\d{2}-\d{2}\s*\n+/, "").slice(0, 2000);
      parts.push(body);
    }
    if (digest.dailyDates.length > 10) {
      parts.push(`\n(외 ${digest.dailyDates.length - 10}일 더 있음 — 생략)`);
    }
  }

  return parts.join("\n");
}

function invokeClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const MAX_OUT = 4 * 1024 * 1024;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < MAX_OUT) stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < MAX_OUT) stderr += chunk;
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("claude CLI 타임아웃 (120s)"));
    }, 120_000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            `claude exit ${code}: ${stderr.trim().slice(0, 500) || "(no stderr)"}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.write(prompt, "utf8");
    child.stdin.end();
  });
}

export async function buildDigestSummary(days: number): Promise<DigestSummaryResult> {
  const digest = await buildDigest(days);

  const label = rangeLabel(days);
  const intro = `아래 데이터는 "${label}(${digest.from.slice(0, 10)} ~ ${digest.to.slice(0, 10)})" 동안의 활동입니다.\n`;
  const context = buildContext(digest);
  const prompt = intro + "\n" + PROMPT_HEADER + "\n" + context;

  let markdown: string;
  try {
    markdown = await invokeClaude(prompt);
  } catch (err) {
    throw new Error(
      `claude CLI 호출 실패: ${(err as Error).message}. (claude 가 PATH 에 있는지 확인)`,
    );
  }

  if (!markdown) {
    throw new Error("AI 응답이 비어있음");
  }

  return {
    rangeDays: days,
    from: digest.from,
    to: digest.to,
    markdown,
    digest,
  };
}
