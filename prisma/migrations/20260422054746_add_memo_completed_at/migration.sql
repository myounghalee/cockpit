-- AlterTable
ALTER TABLE "Memo" ADD COLUMN "completedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Memo_projectId_completedAt_idx" ON "Memo"("projectId", "completedAt");
