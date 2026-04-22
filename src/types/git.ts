export interface FileChange {
  path: string;
  status: string; // M, A, D, R, C, U, ?, space
}

export interface RepoStatus {
  currentBranch: string;
  isClean: boolean;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface Branch {
  name: string;
  current?: boolean;
  upstream?: string;
}

export interface BranchesResponse {
  current: string;
  local: Branch[];
  remote: Branch[];
}

export interface GraphCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
  branches: string[];
  tags: string[];
  isHead: boolean;
}

export interface CommitDetail {
  hash: string;
  message: string;
  author: string;
  authoredAt: string;
  parents: string[];
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
}

export type DiffLineType = "ctx" | "add" | "del";

export interface DiffLine {
  type: DiffLineType;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffResponse {
  oversize: boolean;
  size: number;
  hunks: DiffHunk[];
}
