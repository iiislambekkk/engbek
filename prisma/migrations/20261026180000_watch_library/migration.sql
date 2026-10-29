CREATE TABLE "WatchMedia" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL, "title" TEXT NOT NULL, "url" TEXT NOT NULL,
  "thumbnail" TEXT, "durationMs" INTEGER, "imdbId" TEXT, "season" INTEGER, "episode" INTEGER,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchMedia_userId_source_sourceId_key" ON "WatchMedia"("userId", "source", "sourceId");
CREATE INDEX "WatchMedia_userId_updatedAt_idx" ON "WatchMedia"("userId", "updatedAt");
CREATE TABLE "WatchTrack" (
  "id" TEXT NOT NULL PRIMARY KEY, "mediaId" TEXT NOT NULL, "key" TEXT NOT NULL, "language" TEXT,
  FOREIGN KEY ("mediaId") REFERENCES "WatchMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchTrack_mediaId_key_key" ON "WatchTrack"("mediaId", "key");
CREATE TABLE "WatchLine" (
  "id" TEXT NOT NULL PRIMARY KEY, "trackId" TEXT NOT NULL, "key" TEXT NOT NULL, "text" TEXT NOT NULL,
  "startMs" INTEGER NOT NULL, "endMs" INTEGER NOT NULL, "approximate" BOOLEAN NOT NULL DEFAULT false,
  "bookmarked" BOOLEAN NOT NULL DEFAULT false, "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("trackId") REFERENCES "WatchTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WatchLine_trackId_key_key" ON "WatchLine"("trackId", "key");
CREATE INDEX "WatchLine_trackId_startMs_idx" ON "WatchLine"("trackId", "startMs");
ALTER TABLE "WatchSession" ADD COLUMN "mediaId" TEXT REFERENCES "WatchMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WatchSession" ADD COLUMN "capturedAt" DATETIME;
ALTER TABLE "WatchSession" ADD COLUMN "playbackRate" REAL NOT NULL DEFAULT 1;
ALTER TABLE "WatchSession" ADD COLUMN "activeTrack" TEXT;
ALTER TABLE "WatchSession" ADD COLUMN "activeKeys" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "WatchCue" ADD COLUMN "lineId" TEXT REFERENCES "WatchLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep original receipts while assembling one transcript per video and track.
CREATE TEMP TABLE "_watch_media" AS
SELECT *, CASE WHEN "source" = 'stremio' AND "imdbId" IS NOT NULL
  THEN "imdbId" || ':' || COALESCE("season", '') || ':' || COALESCE("episode", '')
  ELSE "sourceId" END AS "canonicalId" FROM "WatchSession";
INSERT INTO "WatchMedia" ("id", "userId", "source", "sourceId", "title", "url", "thumbnail", "durationMs", "imdbId", "season", "episode", "updatedAt")
SELECT 'media:' || "id", "userId", "source", "canonicalId", "title", "url", "thumbnail", "durationMs", "imdbId", "season", "episode", "updatedAt"
FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "userId", "source", "canonicalId" ORDER BY "updatedAt" DESC, "id") AS "rank" FROM "_watch_media") WHERE "rank" = 1;
UPDATE "WatchSession" SET "mediaId" = (
 SELECT m."id" FROM "WatchMedia" m JOIN "_watch_media" s ON s."id" = "WatchSession"."id"
 WHERE m."userId" = s."userId" AND m."source" = s."source" AND m."sourceId" = s."canonicalId"
);
INSERT INTO "WatchTrack" ("id", "mediaId", "key", "language")
SELECT 'track:' || MIN(c."id"), s."mediaId", c."track", MAX(c."language")
FROM "WatchCue" c JOIN "WatchSession" s ON s."id" = c."sessionId" GROUP BY s."mediaId", c."track";
CREATE TEMP TABLE "_watch_lines" AS
SELECT c.*, t."id" AS "trackId", s."updatedAt",
 CASE WHEN c."approximate" THEN 'dom:' || (c."startMs" / 1500) || ':' || c."text" ELSE c."cueKey" END AS "lineKey"
FROM "WatchCue" c JOIN "WatchSession" s ON s."id" = c."sessionId"
JOIN "WatchTrack" t ON t."mediaId" = s."mediaId" AND t."key" = c."track";
INSERT INTO "WatchLine" ("id", "trackId", "key", "text", "startMs", "endMs", "approximate", "updatedAt")
SELECT 'line:' || MIN("id"), "trackId", "lineKey", MAX("text"), MIN("startMs"), MAX("endMs"), MAX("approximate"), MAX("updatedAt")
FROM "_watch_lines" GROUP BY "trackId", "lineKey";
UPDATE "WatchCue" SET "lineId" = (
 SELECT l."id" FROM "WatchLine" l JOIN "_watch_lines" c ON c."id" = "WatchCue"."id"
 WHERE l."trackId" = c."trackId" AND l."key" = c."lineKey"
);
DROP TABLE "_watch_lines";
DROP TABLE "_watch_media";
