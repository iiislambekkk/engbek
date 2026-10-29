CREATE TABLE "WatchExplanation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "contextHash" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "explanation" JSONB NOT NULL,
  "chat" JSONB NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WatchExplanation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WatchExplanation_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "WatchMedia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WatchExplanation_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "WatchLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchExplanation_userId_mediaId_lineId_text_contextHash_key" ON "WatchExplanation"("userId", "mediaId", "lineId", "text", "contextHash");
CREATE INDEX "WatchExplanation_userId_mediaId_createdAt_idx" ON "WatchExplanation"("userId", "mediaId", "createdAt");
