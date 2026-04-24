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
}

async function detectGitEmail(): Promise<string | null> {
  try {
    const { stdout } = await execFileP(
      "git",
      ["config", "--global", "user.email"],
      { timeout: 2000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function detectGitEmailIn(cwd: string): Promise<string | null> {
  // 프로젝트 로컬 설정이 있으면 그것 우선 (사용자가 repo 별로 다른 identity 쓰는 경우 대응)
  try {
    const { stdout } = await execFileP(
      "git",
      ["-C", cwd, "config", "user.email"],
      { timeout: 2000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function gitLogFor(
  cwd: string,
  since: string,
  author: string | null,
): Promise<GitCommit[]> {
  const args = [
    "-C",
    cwd,
    "log",
    `--since=${since}`,
    "--pretty=format:%H%x09%aI%x09%ae%x09%s",
  ];
  if (author) args.push(`--author=${author}`);
  try {
    const { stdout } = await execFileP("git", args, {
      timeout: 8000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (!stdout.trim()) return [];
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const [hash, date, author, ...subj] = parts;
        return {
          hash: hash ?? "",
          date: date ?? "",
          author: author ?? "",
          subject: subj.join("\t"),
        };
      });
  } catch {
    return [];
  }
}

export async function buildDigest(days: number): Promise<DigestResult> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const since = from.toISOString();

  const globalEmail = await detectGitEmail();

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, path: true },
    orderBy: { name: "asc" },
  });

  // 병렬로 git log 실행. 각 repo 의 로컬 user.email 우선, 없으면 글로벌.
  // 사용자가 repo 별로 다른 identity(개인 이메일 vs 회사 이메일) 쓰는 경우를 커버.
  const commitsByProject = (
    await Promise.all(
      projects.map(async (p) => {
        const gitDir = path.join(p.path, ".git");
        if (!fs.existsSync(gitDir)) return null;
        const localEmail = await detectGitEmailIn(p.path);
        const author = localEmail ?? globalEmail;
        const commits = await gitLogFor(p.path, since, author);
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
  };
}
