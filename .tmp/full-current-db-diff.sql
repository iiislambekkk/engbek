-- CreateTable
CREATE TABLE "MarkedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceId" TEXT,
    "locationLabel" TEXT,
    "locationValue" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarkedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceId" TEXT,
    "locationLabel" TEXT,
    "locationValue" INTEGER,
    "explanation" JSONB NOT NULL,
    "chat" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranslationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VocabularyItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phonetic" TEXT,
    "pronunciation" TEXT,
    "familiarity" TEXT NOT NULL DEFAULT 'NEW',
    "reviewDueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewInterval" INTEGER NOT NULL DEFAULT 0,
    "reviewEase" REAL NOT NULL DEFAULT 2.5,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "grammar" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VocabularyItem" ("createdAt", "familiarity", "grammar", "id", "normalizedTerm", "notes", "phonetic", "pronunciation", "reviewCount", "reviewDueAt", "reviewEase", "reviewInterval", "term", "type", "updatedAt", "userId") SELECT "createdAt", "familiarity", "grammar", "id", "normalizedTerm", "notes", "phonetic", "pronunciation", "reviewCount", "reviewDueAt", "reviewEase", "reviewInterval", "term", "type", "updatedAt", "userId" FROM "VocabularyItem";
DROP TABLE "VocabularyItem";
ALTER TABLE "new_VocabularyItem" RENAME TO "VocabularyItem";
CREATE INDEX "VocabularyItem_userId_idx" ON "VocabularyItem"("userId");
CREATE INDEX "VocabularyItem_userId_type_idx" ON "VocabularyItem"("userId", "type");
CREATE INDEX "VocabularyItem_userId_familiarity_idx" ON "VocabularyItem"("userId", "familiarity");
CREATE INDEX "VocabularyItem_userId_reviewDueAt_idx" ON "VocabularyItem"("userId", "reviewDueAt");
CREATE INDEX "VocabularyItem_userId_normalizedTerm_idx" ON "VocabularyItem"("userId", "normalizedTerm");
CREATE UNIQUE INDEX "VocabularyItem_userId_normalizedTerm_type_key" ON "VocabularyItem"("userId", "normalizedTerm", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MarkedItem_userId_sourceType_createdAt_idx" ON "MarkedItem"("userId", "sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "MarkedItem_userId_kind_createdAt_idx" ON "MarkedItem"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationEntry_userId_updatedAt_idx" ON "TranslationEntry"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "TranslationEntry_userId_sourceType_updatedAt_idx" ON "TranslationEntry"("userId", "sourceType", "updatedAt");
