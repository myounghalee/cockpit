-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'feature',
    "successCriteria" TEXT,
    "jiraKey" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "lastReworkRequest" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("createdAt", "description", "id", "order", "priority", "projectId", "status", "title", "updatedAt") SELECT "createdAt", "description", "id", "order", "priority", "projectId", "status", "title", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE INDEX "Ticket_projectId_status_idx" ON "Ticket"("projectId", "status");
CREATE INDEX "Ticket_jiraKey_idx" ON "Ticket"("jiraKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
