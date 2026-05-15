/**
 * Weekly/Monthly digest — 등록된 모든 프로젝트와 Claude Code 활동을 기간 단위로 집계.
 *
 * 소스:
 *   1. prisma.Project 목록 → 각 경로에 git log --since=<from>
 *      (author=<git config user.email>). 해당 이메일 커밋만 뽑음.
 *   2. ~/.claude/projects/*.jsonl → 기간 내 수정된 세션 목록
 *   3. ~/.cockpit-userdata/daily/ → 기간 내 daily.md 존재 날짜
 */
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { listSessions } from "@/lib/claude-data";
import { listDailyDates } from "@/lib/daily-log";
import { buildSlackDigest, type SlackDigest } from "@/lib/slack";

const execFileP = promisify(execFile);

export interface GitCommit {
  hash: string;
  date: string; // ISO
  author: string;
  subject: string;
}

export interface ProjectCommits {
  projectId: string;
  projectName: string;
  projectPath: string;
  commits: GitCommit[];
}

export interface DigestSessionProject {
  projectName: string;
  count: number;
}

export interface DigestResult {
  rangeDays: number;
  from: string; // ISO
  to: string;
  gitEmail: string | null;
  commitsByProject: ProjectCommits[];
  totalCommits: number;
  sessionCount: number;
  sessionsByProject: DigestSessionProject[];
  dailyDates: string[];
  /** Slack 활동 요약. 토큰 미설정/실패 시 available=false. */
  slack: SlackDigest;
}

async function gitConfigGlobal(key: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("git", ["config", "--global", key], {
      timeout: 2000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function gitConfigLocal(cwd: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("git", ["-C", cwd, "config", key], {
      timeout: 2000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function detectGitEmail(): Promise<string | null> {
  return gitConfigGlobal("user.email");
}

async function detectGitEmailIn(cwd: string): Promise<string | null> {
  // 프로젝트 로컬 설정이 있으면 그것 우선 (사용자가 repo 별로 다른 identity 쓰는 경우 대응)
  return gitConfigLocal(cwd, "user.email");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * --author 필터에 쓸 author 패턴 생성.
 *
 * 단일 이메일 기반 필터의 한계:
 *   - GitHub UI에서 PR을 squash/merge하면 author 이메일이 사용자 GitHub
 *     noreply 이메일(예: 1234+id@users.noreply.github.com)로 바뀌어 로컬
 *     `user.email` 매칭에서 누락됨.
 *
 * 해결: author **name** 까지 OR 로 묶음. 같은 사람이 여러 이메일을 쓰더라도
 * `git config user.name` 값이 commit author 헤더에 포함돼 있으면 매칭됨.
 */
function buildAuthorPattern(values: Array<string | null | undefined>): string | null {
  const uniq = Array.from(
    new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  if (uniq.length === 0) return null;
  return uniq.map(escapeRegex).join("\\|");
}

async function gitLogFor(
  cwd: string,
  since: string,
  authorPattern: string | null,
): Promise<GitCommit[]> {
  // --all: 현재 HEAD뿐 아니라 모든 ref 검사 → squash-merge 등으로 다른 브랜치에
  // 들어간 사용자 commit도 포함.
  const args = [
    "-C",
    cwd,
    "log",
    "--all",
    `--since=${since}`,
    "--pretty=format:%H%x09%aI%x09%ae%x09%s",
  ];
  if (authorPattern) args.push(`--author=${authorPattern}`);
  try {
    const { stdout } = await execFileP("git", args, {
      timeout: 8000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (!stdout.trim()) return [];
    // --all 사용 시 같은 commit이 여러 ref에서 보일 수는 없으나 (hash 유일),
    // 만약을 위해 hash 기준 dedupe.
    const seen = new Set<string>();
    const out: GitCommit[] = [];
    for (const line of stdout.split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      const [hash, date, author, ...subj] = parts;
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);
      out.push({
        hash,
        date: date ?? "",
        author: author ?? "",
        subject: subj.join("\t"),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function buildDigest(days: number): Promise<DigestResult> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const since = from.toISOString();

  const [globalEmail, globalName] = await Promise.all([
    detectGitEmail(),
    gitConfigGlobal("user.name"),
  ]);

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, path: true },
    orderBy: { name: "asc" },
  });

  // 병렬로 git log 실행. 각 repo 의 로컬 user.email/name 우선, 없으면 글로벌.
  // email + name 을 OR 로 매칭해 GitHub squash merge 가 author 이메일을
  // noreply.github.com 으로 바꾼 commit 도 잡는다.
  const commitsByProject = (
    await Promise.all(
      projects.map(async (p) => {
        const gitDir = path.join(p.path, ".git");
        if (!fs.existsSync(gitDir)) return null;
        const [localEmail, localName] = await Promise.all([
          detectGitEmailIn(p.path),
          gitConfigLocal(p.path, "user.name"),
        ]);
        const pattern = buildAuthorPattern([
          localEmail ?? globalEmail,
          localName ?? globalName,
        ]);
        const commits = await gitLogFor(p.path, since, pattern);
        if (commits.length === 0) return null;
        return {
          projectId: p.id,
          projectName: p.name,
          projectPath: p.path,
          commits,
        } satisfies ProjectCommits;
      }),
    )
  )
    .filter((x): x is ProjectCommits => x != null)
    .sort((a, b) => b.commits.length - a.commits.length);

  const totalCommits = commitsByProject.reduce(
    (sum, p) => sum + p.commits.length,
    0,
  );

  // Claude Code 세션
  const allSessions = listSessions(5000);
  const sessionsInRange = allSessions.filter(
    (s) => s.mtime >= from.getTime(),
  );
  const projectSessionCount = new Map<string, number>();
  for (const s of sessionsInRange) {
    projectSessionCount.set(
      s.projectName,
      (projectSessionCount.get(s.projectName) ?? 0) + 1,
    );
  }
  const sessionsByProject = Array.from(projectSessionCount.entries())
    .map(([projectName, count]) => ({ projectName, count }))
    .sort((a, b) => b.count - a.count);

  // Daily dates in range
  const fromDateStr = from.toISOString().slice(0, 10);
  const dailyDates = listDailyDates(days + 5).filter((d) => d >= fromDateStr);

  // Slack — 토큰 없거나 실패해도 digest 자체는 살아있도록 catch
  let slack: SlackDigest;
  try {
    slack = await buildSlackDigest(days);
  } catch (err) {
    slack = {
      available: false,
      reason: (err as Error).message,
      myUserId: null,
      myDisplayName: null,
      team: null,
      totalMessages: 0,
      channels: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    rangeDays: days,
    from: from.toISOString(),
    to: to.toISOString(),
    gitEmail: globalEmail,
    commitsByProject,
    totalCommits,
    sessionCount: sessionsInRange.length,
    sessionsByProject,
    dailyDates,
    slack,
  };
}
