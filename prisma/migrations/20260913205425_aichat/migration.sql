/*
  Warnings:

  - Added the required column `externalId` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Chat_userId_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("chatId", "createdAt", "id", "message", "role") SELECT "chatId", "createdAt", "id", "message", "role" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_chatId_createdAt_idx" ON "ChatMessage"("chatId", "createdAt");
CREATE UNIQUE INDEX "ChatMessage_chatId_externalId_key" ON "ChatMessage"("chatId", "externalId");
CREATE UNIQUE INDEX "ChatMessage_chatId_position_key" ON "ChatMessage"("chatId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
