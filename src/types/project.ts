export interface ProjectFolder {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  folderId: string | null;
  isFavorite: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  isGitRepo?: boolean; // tree API 등에서 부가 정보
}

export interface ProjectsResponse {
  projects: Project[];
  folders: ProjectFolder[];
}

export interface TreeNode {
  name: string;
  path: string;
  absolutePath: string;
  type: "file" | "directory";
  size?: number;
  hasChildren?: boolean;
}

export interface TreeResponse {
  nodes: TreeNode[];
}
