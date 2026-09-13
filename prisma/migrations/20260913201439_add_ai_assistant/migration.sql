/*
  Warnings:

  - Added the required column `normalizedTerm` to the `VocabularyItem` table without a default value. This is not possible if the table is not empty.

*/
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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VocabularyItem" ("createdAt", "familiarity", "id", "notes", "phonetic", "pronunciation", "term", "type", "updatedAt", "userId") SELECT "createdAt", "familiarity", "id", "notes", "phonetic", "pronunciation", "term", "type", "updatedAt", "userId" FROM "VocabularyItem";
DROP TABLE "VocabularyItem";
ALTER TABLE "new_VocabularyItem" RENAME TO "VocabularyItem";
CREATE INDEX "VocabularyItem_userId_idx" ON "VocabularyItem"("userId");
CREATE INDEX "VocabularyItem_userId_type_idx" ON "VocabularyItem"("userId", "type");
CREATE INDEX "VocabularyItem_userId_familiarity_idx" ON "VocabularyItem"("userId", "familiarity");
CREATE INDEX "VocabularyItem_userId_normalizedTerm_idx" ON "VocabularyItem"("userId", "normalizedTerm");
CREATE UNIQUE INDEX "VocabularyItem_userId_normalizedTerm_type_key" ON "VocabularyItem"("userId", "normalizedTerm", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
