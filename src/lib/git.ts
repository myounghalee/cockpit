/**
 * Git CLI 래퍼 — `execFile(shell=false)` 기반으로 shell 인젝션 방지.
 * branch/hash/path는 반드시 정규식으로 검증.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  Branch,
  BranchesResponse,
  CommitDetail,
  DiffHunk,
  DiffLine,
  DiffMeta,
  FileChange,
  GraphCommit,
  RepoStatus,
} from "@/types/git";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX = 10 * 1024 * 1024;

async function git(
  cwd: string,
  args: string[],
  opts: { maxBytes?: number } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: opts.maxBytes ?? DEFAULT_MAX,
      encoding: "utf8",
    });
    return stdout.trimEnd();
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (e.stdout) return String(e.stdout).trimEnd();
    throw new Error(e.stderr || e.message || "git command failed");
  }
}

// ─── 검증 유틸 ────────────────────────────────────────────────

const BRANCH_RE = /^[\w./-]+$/;
const HASH_RE = /^[a-f0-9]{4,40}$/;

export function validateBranch(name: string): string {
  if (!BRANCH_RE.test(name)) throw new Error("invalid branch name");
  return name;
}
export function validateHash(hash: string): string {
  if (!HASH_RE.test(hash)) throw new Error("invalid commit hash");
  return hash;
}
export function validateRelPath(p: string): string {
  // Unix(/) 와 Windows(\) 경로 구분자 모두에서 상위 탈출 차단
  if (!p || p.includes("\0") || /(^|[/\\])\.\\.([/\\]|$)/.test(p)) {
    throw new Error("invalid path");
  }
  return p;
}

// ─── 기본 ──────────────────────────────────────────────────────

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

export async function getStatus(cwd: string): Promise<RepoStatus> {
  const [branch, statusOutput, aheadBehind] = await Promise.all([
    git(cwd, ["branch", "--show-current"]),
    // -uall: untracked 디렉토리를 폴더 단위가 아닌 **개별 파일**로 나열 → diff 뷰어와 호환
    git(cwd, ["status", "--porcelain", "-uall"]),
    git(cwd, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]).catch(
      () => "0\t0",
    ),
  ]);

  const [behindStr = "0", aheadStr = "0"] = aheadBehind.split(/\s+/);
  const behind = Number(behindStr) || 0;
  const ahead = Number(aheadStr) || 0;

  const staged: FileChange[] = [];
  const unstaged: FileChange[] = [];
  const untracked: string[] = [];

  for (const line of statusOutput.split("\n").filter(Boolean)) {
    const indexStatus = line[0];
    const workStatus = line[1];
    const filePath = line.slice(3);

    if (indexStatus === "?") {
      untracked.push(filePath);
    } else {
      if (indexStatus !== " ") {
        staged.push({ path: filePath, status: indexStatus });
      }
      if (workStatus !== " ") {
        unstaged.push({ path: filePath, status: workStatus });
      }
    }
  }

  return {
    currentBranch: branch || "HEAD",
    isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    staged,
    unstaged,
    untracked,
    ahead,
    behind,
  };
}

// ─── 브랜치 ────────────────────────────────────────────────────

export async function getBranches(cwd: string): Promise<BranchesResponse> {
  const output = await git(cwd, [
    "branch",
    "-a",
    "--format=%(refname:short)\t%(HEAD)\t%(upstream:short)",
  ]);
  const local: Branch[] = [];
  const remote: Branch[] = [];
  let current = "";

  for (const line of output.split("\n").filter(Boolean)) {
    const [nameRaw, head, upstream] = line.split("\t");
    const name = nameRaw.trim();
    const isCurrent = head === "*";
    if (isCurrent) current = name;
    if (name.includes("/")) {
      // remote (origin/xxx) or weird local
      if (name.startsWith("origin/") || name.includes("/")) {
        // detect remote: `refname:short`가 origin/... 형태면 remote
        remote.push({ name });
        continue;
      }
    }
    local.push({
      name,
      current: isCurrent,
      upstream: upstream || undefined,
    });
  }

  return { current, local, remote };
}

export async function checkoutBranch(cwd: string, name: string): Promise<void> {
  validateBranch(name);
  await git(cwd, ["checkout", name]);
}

// ─── 커밋 그래프 ───────────────────────────────────────────────

export async function getCommitGraph(
  cwd: string,
  limit: number,
  allBranches = true,
): Promise<GraphCommit[]> {
  const n = Math.max(1, Math.min(5000, Math.floor(limit)));
  const format = "%H|%h|%s|%an|%ar|%P|%D";
  const output = await git(cwd, [
    "log",
    ...(allBranches ? ["--all"] : []),
    "--topo-order",
    `-${n}`,
    `--pretty=format:${format}`,
  ]);
  if (!output) return [];

  const commits: GraphCommit[] = [];
  for (const line of output.split("\n")) {
    const [hash, shortHash, message, author, date, parentsStr, refs] =
      line.split("|");
    const parents = parentsStr ? parentsStr.split(" ").filter(Boolean) : [];
    const branches: string[] = [];
    const tags: string[] = [];
    let isHead = false;

    if (refs) {
      for (const ref of refs.split(", ")) {
        if (ref.includes("HEAD")) isHead = true;
        if (ref.startsWith("tag: ")) tags.push(ref.replace("tag: ", ""));
        else if (ref.includes("HEAD ->"))
          branches.push(ref.replace("HEAD -> ", ""));
        else if (!ref.includes("HEAD")) {
          branches.push(ref.replace("origin/", ""));
        }
      }
    }

    commits.push({
      hash,
      shortHash,
      message,
      author,
      date,
      parents,
      branches: [...new Set(branches)],
      tags,
      isHead,
    });
  }
  return commits;
}

// ─── 커밋 상세 ────────────────────────────────────────────────

export async function getCommitDetail(
  cwd: string,
  hash: string,
): Promise<CommitDetail> {
  validateHash(hash);
  const format = "%H|%an|%aI|%P|%s%n%n%b";
  const [meta, statOutput] = await Promise.all([
    git(cwd, ["show", "-s", `--pretty=format:${format}`, hash]),
    git(cwd, ["show", hash, "--stat", "--format="]),
  ]);

  const [header, ...bodyParts] = meta.split("\n\n");
  const [fullHash, author, authoredAt, parentsStr, ...subjectParts] =
    header.split("|");
  const subject = subjectParts.join("|");
  const message = [subject, ...bodyParts].filter(Boolean).join("\n\n");

  const files: CommitDetail["files"] = [];
  for (const line of statOutput.split("\n")) {
    // 마지막 요약 줄(e.g. "5 files changed, 10 insertions(+), 3 deletions(-)")은 '|' 없음
    if (!line.includes("|")) continue;
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+|Bin)\s*([+-]*)/);
    if (!match) continue;
    const [, path, , symbols] = match;
    const additions = (symbols.match(/\+/g) || []).length;
    const deletions = (symbols.match(/-/g) || []).length;
    files.push({
      path: path.trim(),
      additions,
      deletions,
      status: additions > 0 && deletions > 0
        ? "M"
        : additions > 0
          ? "A"
          : deletions > 0
            ? "D"
            : "M",
    });
  }

  return {
    hash: fullHash,
    message,
    author,
    authoredAt,
    parents: parentsStr ? parentsStr.split(" ").filter(Boolean) : [],
    files,
  };
}

// ─── 파일 diff ────────────────────────────────────────────────

const DIFF_MAX_BYTES = 2 * 1024 * 1024;

export async function getFileDiff(
  cwd: string,
  opts: {
    commit?: string;
    path: string;
    staged?: boolean;
    untracked?: boolean;
  },
): Promise<{ size: number; oversize: boolean; text: string }> {
  validateRelPath(opts.path);
  let args: string[];
  if (opts.untracked) {
    // 추적 안 되는 파일은 git diff가 빈 결과 → /dev/null 과 비교해 전체를 "추가" diff로 표현
    // `git diff --no-index`는 diff가 있으면 exit 1이지만 stdout에 결과가 담김 (git() 헬퍼가 stdout 반환)
    const nullDev = process.platform === "win32" ? "NUL" : "/dev/null";
    args = ["diff", "--no-index", "--no-color", "--", nullDev, opts.path];
  } else if (opts.commit) {
    validateHash(opts.commit);
    args = ["show", "--format=", "--no-color", opts.commit, "--", opts.path];
  } else if (opts.staged) {
    args = ["diff", "--cached", "--no-color", "--", opts.path];
  } else {
    args = ["diff", "--no-color", "--", opts.path];
  }

  const text = await git(cwd, args, { maxBytes: DIFF_MAX_BYTES });
  const size = Buffer.byteLength(text, "utf8");
  if (size > DIFF_MAX_BYTES) {
    return { size, oversize: true, text: "" };
  }
  return { size, oversize: false, text };
}

// ─── Diff 메타데이터 추출 ─────────────────────────────────────

/**
 * unified diff 헤더(diff/index/mode/Binary/rename 등)에서 파일 상태를 추출.
 * 새 파일이지만 빈 파일이거나 바이너리인 경우 hunk가 없어 UI가 "변경 없음"으로 보이는 문제를
 * 명시적으로 구분하기 위해 사용.
 */
export function parseDiffMeta(text: string): DiffMeta {
  const meta: DiffMeta = {
    isNew: false,
    isDeleted: false,
    isBinary: false,
    isRename: false,
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("@@")) break; // 헤더 영역 끝
    if (line.startsWith("new file mode")) {
      meta.isNew = true;
      meta.newMode = line.slice("new file mode ".length).trim();
    } else if (line.startsWith("deleted file mode")) {
      meta.isDeleted = true;
      meta.oldMode = line.slice("deleted file mode ".length).trim();
    } else if (line.startsWith("rename from") || line.startsWith("rename to")) {
      meta.isRename = true;
    } else if (line.startsWith("Binary files ")) {
      meta.isBinary = true;
    }
  }
  return meta;
}

// ─── Unified diff parser → hunks ─────────────────────────────

export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = text.split("\n");
  let current: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(
        /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/,
      );
      if (!match) continue;
      current = {
        oldStart: Number(match[1]),
        oldLines: Number(match[2] ?? 1),
        newStart: Number(match[3]),
        newLines: Number(match[4] ?? 1),
        header: line,
        lines: [],
      };
      hunks.push(current);
      oldNo = current.oldStart;
      newNo = current.newStart;
      continue;
    }
    if (!current) continue;

    // 주의: hunk 안에서는 `+++`/`---` 로 시작하는 라인을 스킵하면 안 된다.
    // 파일 헤더(`--- a/foo`, `+++ b/foo`) 는 항상 `@@` 보다 앞에 오므로
    // 위의 `if (!current) continue;` 가 이미 걸러준다. hunk 안에서 만나는
    // `+++` / `---` 는 markdown 등의 실제 콘텐츠 (예: `---` HR 삭제 → diff `----`).
    if (line.startsWith("\\ ")) continue; // "\ No newline at end of file"

    const type = line.startsWith("+")
      ? "add"
      : line.startsWith("-")
        ? "del"
        : "ctx";
    const text = line.slice(1);
    const entry: DiffLine = {
      type,
      oldNo: type === "add" ? null : oldNo,
      newNo: type === "del" ? null : newNo,
      text,
    };
    current.lines.push(entry);
    if (type !== "add") oldNo++;
    if (type !== "del") newNo++;
  }

  return hunks;
}

// ─── 스테이징 · 커밋 (M1) ───────────────────────────────────────

function validatePaths(paths: string[]): string[] {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("paths must be a non-empty array");
  }
  return paths.map(validateRelPath);
}

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
  const safe = validatePaths(paths);
  await git(cwd, ["add", "--", ...safe]);
}

export async function stageAll(cwd: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
  const safe = validatePaths(paths);
  await git(cwd, ["reset", "HEAD", "--", ...safe]);
}

export async function discardChanges(
  cwd: string,
  paths: string[],
): Promise<void> {
  const safe = validatePaths(paths);
  await git(cwd, ["checkout", "--", ...safe]);
}

export async function commitChanges(
  cwd: string,
  message: string,
  amend = false,
): Promise<string> {
  if (!amend && !message.trim()) throw new Error("commit message required");
  const args = ["commit"];
  if (amend) args.push("--amend");
  if (message.trim()) args.push("-m", message);
  else if (amend) args.push("--no-edit");
  const output = await git(cwd, args);
  const match = output.match(/\[[\w./-]+(?:\s\(.+\))?\s([a-f0-9]+)\]/);
  return match?.[1] ?? "";
}

// ─── 원격 동기화 (M2) ──────────────────────────────────────────

export async function fetchAll(cwd: string): Promise<string> {
  return git(cwd, ["fetch", "--all", "--prune"]);
}

export async function pullRemote(
  cwd: string,
  rebase = false,
): Promise<string> {
  const args = ["pull"];
  if (rebase) args.push("--rebase");
  return git(cwd, args);
}

export async function pushRemote(
  cwd: string,
  opts: { force?: boolean; setUpstream?: boolean } = {},
): Promise<string> {
  const args = ["push"];
  if (opts.force) args.push("--force-with-lease"); // 안전한 force
  if (opts.setUpstream) {
    // 현재 브랜치를 원격에 upstream 설정 + 푸시
    const branch = await git(cwd, ["branch", "--show-current"]);
    if (!branch) throw new Error("detached HEAD: cannot push with -u");
    validateBranch(branch);
    args.push("-u", "origin", branch);
  }
  return git(cwd, args);
}

// ─── 머지 · 리베이스 · Abort (M3) ──────────────────────────────

export interface MergeOptions {
  noFF?: boolean;
  ffOnly?: boolean;
  squash?: boolean;
}

export async function mergeBranch(
  cwd: string,
  branch: string,
  opts: MergeOptions = {},
): Promise<string> {
  validateBranch(branch);
  const args = ["merge"];
  if (opts.noFF) args.push("--no-ff");
  if (opts.ffOnly) args.push("--ff-only");
  if (opts.squash) args.push("--squash");
  args.push(branch);
  return git(cwd, args);
}

export async function rebaseOnto(cwd: string, onto: string): Promise<string> {
  validateBranch(onto);
  return git(cwd, ["rebase", onto]);
}

export async function abortOp(
  cwd: string,
  op: "merge" | "rebase",
): Promise<void> {
  if (op !== "merge" && op !== "rebase") throw new Error("invalid op");
  await git(cwd, [op, "--abort"]);
}

// ─── Stash (M4) ────────────────────────────────────────────────

export interface StashEntry {
  index: number;
  ref: string; // stash@{0}
  subject: string;
  ago: string;
}

export async function listStash(cwd: string): Promise<StashEntry[]> {
  const out = await git(cwd, [
    "stash",
    "list",
    "--pretty=format:%gd|%gs|%ar",
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .map((line, i) => {
      const [ref, subject, ago] = line.split("|");
      return { index: i, ref, subject: subject ?? "", ago: ago ?? "" };
    })
    .filter((s) => s.ref);
}

export async function stashSave(cwd: string, message?: string): Promise<void> {
  const args = ["stash", "push"];
  if (message?.trim()) args.push("-m", message.trim());
  await git(cwd, args);
}

export async function stashPop(cwd: string, index?: number): Promise<void> {
  const args = ["stash", "pop"];
  if (typeof index === "number") args.push(`stash@{${index}}`);
  await git(cwd, args);
}

export async function stashDrop(cwd: string, index: number): Promise<void> {
  if (!Number.isInteger(index) || index < 0) throw new Error("invalid index");
  await git(cwd, ["stash", "drop", `stash@{${index}}`]);
}

export async function stashApply(cwd: string, index: number): Promise<void> {
  if (!Number.isInteger(index) || index < 0) throw new Error("invalid index");
  await git(cwd, ["stash", "apply", `stash@{${index}}`]);
}

// ─── 브랜치 생성/삭제 (M5) ─────────────────────────────────────

export async function createBranch(
  cwd: string,
  name: string,
  from?: string,
): Promise<void> {
  validateBranch(name);
  if (from) validateBranch(from);
  const args = ["branch", name];
  if (from) args.push(from);
  await git(cwd, args);
}

export async function deleteBranch(
  cwd: string,
  name: string,
  force = false,
): Promise<void> {
  validateBranch(name);
  await git(cwd, ["branch", force ? "-D" : "-d", name]);
}

export async function deleteRemoteBranch(
  cwd: string,
  name: string,
): Promise<void> {
  validateBranch(name);
  await git(cwd, ["push", "origin", "--delete", name]);
}
