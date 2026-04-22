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
    "resultSummary" TEXT,
    "pdcaStage" TEXT,
    "autoMode" TEXT NOT NULL DEFAULT 'manual',
    "commitMode" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("completedAt", "createdAt", "description", "id", "jiraKey", "lastReworkRequest", "order", "pdcaStage", "priority", "projectId", "resultSummary", "reworkCount", "sessionId", "startedAt", "status", "successCriteria", "title", "type", "updatedAt") SELECT "completedAt", "createdAt", "description", "id", "jiraKey", "lastReworkRequest", "order", "pdcaStage", "priority", "projectId", "resultSummary", "reworkCount", "sessionId", "startedAt", "status", "successCriteria", "title", "type", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE INDEX "Ticket_projectId_status_idx" ON "Ticket"("projectId", "status");
CREATE INDEX "Ticket_jiraKey_idx" ON "Ticket"("jiraKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
