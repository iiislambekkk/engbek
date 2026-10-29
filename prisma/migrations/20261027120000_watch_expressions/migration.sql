ALTER TABLE "UserSettings" ADD COLUMN "watchHighlightColor" TEXT NOT NULL DEFAULT '#a78bfa';

CREATE TABLE "WatchExpression" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "sessionId" TEXT,
  "text" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("mediaId") REFERENCES "WatchMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("lineId") REFERENCES "WatchLine"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WatchExpression_userId_mediaId_createdAt_idx" ON "WatchExpression"("userId", "mediaId", "createdAt");
