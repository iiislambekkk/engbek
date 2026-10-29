ALTER TABLE "ReadDocument" ADD COLUMN "originalCoverPath" TEXT;
ALTER TABLE "ReadDocument" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ReadDocument" SET "originalCoverPath" = "coverPath" WHERE "coverPath" IS NOT NULL;
CREATE TABLE "ReadBookList" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ReadBookList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ReadBookListEntry" (
  "listId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReadBookListEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ReadBookList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReadBookListEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("listId", "documentId")
);
CREATE UNIQUE INDEX "ReadBookList_userId_name_key" ON "ReadBookList"("userId", "name");
CREATE INDEX "ReadBookList_userId_updatedAt_idx" ON "ReadBookList"("userId", "updatedAt");
CREATE INDEX "ReadBookListEntry_documentId_idx" ON "ReadBookListEntry"("documentId");
