export interface Memo {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  tags: string;
  pinnedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  convertedTicketId: string | null;
  createdAt: string;
  updatedAt: string;
  projectName?: string | null;
}
