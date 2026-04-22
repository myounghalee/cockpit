/**
 * 서버 사이드 파일 시스템 트리 읽기.
 * - 제외 패턴 하드코딩 + env 확장 가능
 * - depth 제한
 * - 보안: 프로젝트 루트 하위만 허용 (디렉토리 트래버설 방지)
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".cache",
  ".DS_Store",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode-test",
]);

export interface TreeNode {
  name: string;
  path: string; // 프로젝트 root 기준 상대 경로 (POSIX)
  absolutePath: string;
  type: "file" | "directory";
  size?: number;
  hasChildren?: boolean; // directory일 때 하위 항목 존재 여부
}

export interface ReadTreeOptions {
  projectRoot: string; // 절대 경로
  subPath?: string; // 상대 경로 (루트 기준)
  depth?: number;
}

/** 경로가 프로젝트 루트 하위인지 검증 후 절대경로 반환. */
function safeResolve(projectRoot: string, subPath?: string): string {
  const root = path.resolve(projectRoot);
  const abs = subPath
    ? path.resolve(root, subPath)
    : root;
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path traversal forbidden");
  }
  return abs;
}

async function readDir(
  dir: string,
  root: string,
  remainingDepth: number,
): Promise<TreeNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const ent of entries) {
    if (DEFAULT_EXCLUDES.has(ent.name)) continue;
    if (ent.name.startsWith(".") && ent.name !== ".env") {
      // 기본적으로 .로 시작하는 파일/폴더 숨김 (명시적 예외는 향후 옵션화)
      if (ent.name !== ".gitignore" && ent.name !== ".nvmrc") continue;
    }

    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const isDir = ent.isDirectory();
    let size: number | undefined;
    let hasChildren: boolean | undefined;

    if (isDir) {
      if (remainingDepth > 0) {
        // 하위 존재 여부 탐지 (굳이 재귀 없이 head-read)
        try {
          const sub = await fs.readdir(abs);
          hasChildren =
            sub.filter((n) => !DEFAULT_EXCLUDES.has(n)).length > 0;
        } catch {
          hasChildren = false;
        }
      }
    } else {
      try {
        const stat = await fs.stat(abs);
        size = stat.size;
      } catch {
        // ignore
      }
    }

    nodes.push({
      name: ent.name,
      path: rel,
      absolutePath: abs,
      type: isDir ? "directory" : "file",
      size,
      hasChildren,
    });
  }

  // 정렬: 디렉토리 먼저, 이름 오름차순
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function readTree(options: ReadTreeOptions): Promise<TreeNode[]> {
  const root = path.resolve(options.projectRoot);
  const target = safeResolve(root, options.subPath);
  const depth = Math.max(1, Math.min(3, options.depth ?? 1));

  const stat = await fs.stat(target).catch(() => null);
  if (!stat || !stat.isDirectory()) return [];

  return readDir(target, root, depth);
}

/** .git 디렉토리 존재 여부로 git repo 감지 */
export async function detectGitRepo(projectRoot: string): Promise<boolean> {
  try {
    const st = await fs.stat(path.join(projectRoot, ".git"));
    return st.isDirectory() || st.isFile(); // submodule의 경우 파일
  } catch {
    return false;
  }
}

/**
 * 홈 디렉토리 하위 임의 폴더 탐색 (프로젝트 등록 전 선택 UI용).
 * - 경로가 없으면 홈 기준.
 * - traversal 방지: realpath 후 홈 prefix 검증.
 * - 폴더만 반환.
 */
export async function browseHomeDirectory(subPath?: string): Promise<{
  currentPath: string;
  home: string;
  nodes: TreeNode[];
  quickPaths: Array<{ name: string; path: string }>;
}> {
  const home = await fs.realpath(os.homedir());
  const requested = subPath ? path.resolve(subPath) : home;
  const real = await fs.realpath(requested).catch(() => requested);
  if (!real.startsWith(home) && real !== home) {
    throw new Error("홈 디렉토리 하위만 탐색할 수 있습니다.");
  }
  const st = await fs.stat(real);
  if (!st.isDirectory()) throw new Error("디렉토리가 아닙니다.");

  const nodes = await readDir(real, real, 1);
  const foldersOnly = nodes.filter((n) => n.type === "directory");

  // quickPaths 중 존재하는 것만
  const candidates = ["Documents", "Desktop", "Downloads", "Projects"];
  const quickPaths: Array<{ name: string; path: string }> = [];
  for (const name of candidates) {
    const p = path.join(home, name);
    try {
      const s = await fs.stat(p);
      if (s.isDirectory()) quickPaths.push({ name, path: p });
    } catch {
      // skip
    }
  }

  return { currentPath: real, home, nodes: foldersOnly, quickPaths };
}

/**
 * 프로젝트 루트 기준 상대 경로의 텍스트 파일 내용을 읽어 반환.
 * - 크기 상한(기본 1MB) 초과 시 oversize=true.
 * - 첫 4KB에 NUL 바이트 포함 or UTF-8 replacement 5% 초과 시 binary=true.
 */
export interface ReadFileResult {
  binary: boolean;
  oversize: boolean;
  size: number;
  content?: string;
}

export async function readTextFile(
  absPath: string,
  maxBytes: number = 1024 * 1024,
): Promise<ReadFileResult> {
  const st = await fs.stat(absPath);
  if (!st.isFile()) throw new Error("not a file");
  if (st.size > maxBytes) {
    return { binary: false, oversize: true, size: st.size };
  }

  const fh = await fs.open(absPath, "r");
  try {
    const probe = Buffer.alloc(Math.min(4096, st.size));
    if (probe.length > 0) {
      await fh.read(probe, 0, probe.length, 0);
      if (probe.includes(0)) {
        return { binary: true, oversize: false, size: st.size };
      }
    }
  } finally {
    await fh.close();
  }

  const buf = await fs.readFile(absPath);
  const text = buf.toString("utf8");
  const replCount = (text.match(/\uFFFD/g) || []).length;
  if (text.length > 0 && replCount / text.length > 0.05) {
    return { binary: true, oversize: false, size: st.size };
  }
  return { binary: false, oversize: false, size: st.size, content: text };
}

/** 디렉토리 존재 + 디렉토리 여부 검증 (등록 시 사용) */
export async function validateProjectPath(p: string): Promise<{
  ok: boolean;
  absolutePath?: string;
  reason?: string;
}> {
  if (!p || !path.isAbsolute(p)) {
    return { ok: false, reason: "절대 경로여야 합니다." };
  }
  try {
    const real = await fs.realpath(p);
    const st = await fs.stat(real);
    if (!st.isDirectory()) return { ok: false, reason: "디렉토리가 아닙니다." };
    return { ok: true, absolutePath: real };
  } catch (err) {
    return {
      ok: false,
      reason: `경로 접근 실패: ${(err as Error).message}`,
    };
  }
}
