CREATE TABLE "WatchPairing" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "name" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL, "approvedAt" DATETIME
);
CREATE UNIQUE INDEX "WatchPairing_code_key" ON "WatchPairing"("code");
CREATE UNIQUE INDEX "WatchPairing_tokenHash_key" ON "WatchPairing"("tokenHash");
CREATE TABLE "WatchDevice" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "name" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL, "lastSeenAt" DATETIME, "revokedAt" DATETIME,
  CONSTRAINT "WatchDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchDevice_tokenHash_key" ON "WatchDevice"("tokenHash");
CREATE INDEX "WatchDevice_userId_idx" ON "WatchDevice"("userId");
CREATE TABLE "WatchSession" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "deviceId" TEXT NOT NULL,
  "clientSessionId" TEXT NOT NULL, "source" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "url" TEXT NOT NULL, "thumbnail" TEXT, "durationMs" INTEGER,
  "imdbId" TEXT, "season" INTEGER, "episode" INTEGER,
  "positionMs" INTEGER NOT NULL DEFAULT 0, "state" TEXT NOT NULL DEFAULT 'paused',
  "sequence" INTEGER NOT NULL DEFAULT -1, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WatchSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WatchSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "WatchDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchSession_deviceId_clientSessionId_key" ON "WatchSession"("deviceId", "clientSessionId");
CREATE INDEX "WatchSession_userId_updatedAt_idx" ON "WatchSession"("userId", "updatedAt");
CREATE TABLE "WatchCue" (
  "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "cueKey" TEXT NOT NULL,
  "track" TEXT NOT NULL, "language" TEXT, "text" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL, "endMs" INTEGER NOT NULL,
  "approximate" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "WatchCue_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WatchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchCue_sessionId_cueKey_key" ON "WatchCue"("sessionId", "cueKey");
CREATE INDEX "WatchCue_sessionId_startMs_idx" ON "WatchCue"("sessionId", "startMs");
