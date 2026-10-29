ALTER TABLE "VocabularyItem" ADD COLUMN "reviewDueAt" DATETIME NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE "VocabularyItem" ADD COLUMN "reviewInterval" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VocabularyItem" ADD COLUMN "reviewEase" REAL NOT NULL DEFAULT 2.5;
ALTER TABLE "VocabularyItem" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "VocabularyItem_userId_reviewDueAt_idx" ON "VocabularyItem"("userId", "reviewDueAt");
UPDATE "VocabularyItem" SET "reviewDueAt" = CURRENT_TIMESTAMP;
