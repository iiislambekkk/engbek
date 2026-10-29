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
CREATE INDEX "MarkedItem_userId_sourceType_createdAt_idx" ON "MarkedItem"("userId", "sourceType", "createdAt");
CREATE INDEX "MarkedItem_userId_kind_createdAt_idx" ON "MarkedItem"("userId", "kind", "createdAt");

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
  "chat" JSONB NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TranslationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TranslationEntry_userId_updatedAt_idx" ON "TranslationEntry"("userId", "updatedAt");
CREATE INDEX "TranslationEntry_userId_sourceType_updatedAt_idx" ON "TranslationEntry"("userId", "sourceType", "updatedAt");

INSERT INTO "MarkedItem" ("id", "userId", "kind", "text", "context", "sourceType", "sourceTitle", "sourceUrl", "sourceId", "locationLabel", "locationValue", "createdAt", "updatedAt")
SELECT 'legacy-watch-expression:' || expression."id", expression."userId", 'EXPRESSION', expression."text", expression."context", 'WATCH', media."title", media."url", media."id", 'Playback', expression."startMs", expression."createdAt", expression."createdAt"
FROM "WatchExpression" expression JOIN "WatchMedia" media ON media."id" = expression."mediaId";

INSERT INTO "MarkedItem" ("id", "userId", "kind", "text", "context", "sourceType", "sourceTitle", "sourceUrl", "sourceId", "locationLabel", "locationValue", "createdAt", "updatedAt")
SELECT 'legacy-watch-line:' || line."id", media."userId", 'LINE', line."text", line."text", 'WATCH', media."title", media."url", media."id", 'Playback', line."startMs", line."updatedAt", line."updatedAt"
FROM "WatchLine" line JOIN "WatchTrack" track ON track."id" = line."trackId" JOIN "WatchMedia" media ON media."id" = track."mediaId" WHERE line."bookmarked" = 1;

INSERT INTO "TranslationEntry" ("id", "userId", "text", "context", "sourceType", "sourceTitle", "sourceUrl", "sourceId", "locationLabel", "locationValue", "explanation", "chat", "createdAt", "updatedAt")
SELECT 'legacy-watch-translation:' || explanation."id", explanation."userId", explanation."text", explanation."context", 'WATCH', media."title", media."url", media."id", 'Playback', line."startMs", explanation."explanation", explanation."chat", explanation."createdAt", explanation."updatedAt"
FROM "WatchExplanation" explanation JOIN "WatchMedia" media ON media."id" = explanation."mediaId" JOIN "WatchLine" line ON line."id" = explanation."lineId";
