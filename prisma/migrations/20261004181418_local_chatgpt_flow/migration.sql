-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "encryptedIdToken" TEXT;

-- CreateTable
CREATE TABLE "ChatGptHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostId" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatGptAuthAttempt" (
    "stateHash" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "returnOrigin" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "ChatGptAuthAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
DROP TABLE "ChatGptAuthAttempt";
ALTER TABLE "new_ChatGptAuthAttempt" RENAME TO "ChatGptAuthAttempt";
CREATE INDEX "ChatGptAuthAttempt_userId_idx" ON "ChatGptAuthAttempt"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChatGptHost_hostId_key" ON "ChatGptHost"("hostId");
