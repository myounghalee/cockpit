-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "pinnedAt" DATETIME,
    "archivedAt" DATETIME,
    "convertedTicketId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Memo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Memo_convertedTicketId_key" ON "Memo"("convertedTicketId");

-- CreateIndex
CREATE INDEX "Memo_projectId_archivedAt_idx" ON "Memo"("projectId", "archivedAt");

-- CreateIndex
CREATE INDEX "Memo_pinnedAt_idx" ON "Memo"("pinnedAt");
