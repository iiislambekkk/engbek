-- CreateTable
CREATE TABLE "ChatGptAuthAttempt" (
    "stateHash" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "ChatGptAuthAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoAddVocabulary" BOOLEAN NOT NULL DEFAULT false,
    "aiConnection" TEXT NOT NULL DEFAULT 'none',
    "encryptedApiKey" TEXT,
    "chatgptSubject" TEXT,
    "chatgptEmail" TEXT,
    "chatgptClientId" TEXT,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "chatgptScopes" TEXT,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("autoAddVocabulary", "id", "userId") SELECT "autoAddVocabulary", "id", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ChatGptAuthAttempt_userId_idx" ON "ChatGptAuthAttempt"("userId");
