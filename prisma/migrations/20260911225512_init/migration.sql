-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoAddVocabulary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phonetic" TEXT,
    "pronunciation" TEXT,
    "familiarity" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meaning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "translation" TEXT,
    "partOfSpeech" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Meaning_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Example" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meaningId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI_GENERATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Example_meaningId_fkey" FOREIGN KEY ("meaningId") REFERENCES "Meaning" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularySource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VocabularySource_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyItemTag" (
    "vocabularyId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("vocabularyId", "tagId"),
    CONSTRAINT "VocabularyItemTag_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularyItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_idx" ON "VocabularyItem"("userId");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_type_idx" ON "VocabularyItem"("userId", "type");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_familiarity_idx" ON "VocabularyItem"("userId", "familiarity");

-- CreateIndex
CREATE INDEX "VocabularyItem_userId_term_idx" ON "VocabularyItem"("userId", "term");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyItem_userId_term_type_key" ON "VocabularyItem"("userId", "term", "type");

-- CreateIndex
CREATE INDEX "Meaning_vocabularyId_idx" ON "Meaning"("vocabularyId");

-- CreateIndex
CREATE INDEX "Example_meaningId_idx" ON "Example"("meaningId");

-- CreateIndex
CREATE INDEX "VocabularySource_vocabularyId_idx" ON "VocabularySource"("vocabularyId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "VocabularyItemTag_tagId_idx" ON "VocabularyItemTag"("tagId");
