CREATE TABLE "ReadDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "filePath" TEXT,
  "originalFileName" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "extractedText" TEXT NOT NULL,
  "positionType" TEXT,
  "positionPage" INTEGER,
  "positionBlockId" TEXT,
  "progress" REAL NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ReadDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ReadDocument_userId_updatedAt_idx" ON "ReadDocument"("userId", "updatedAt");

CREATE TABLE "ReadDocumentBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "pageNumber" INTEGER,
  "sectionId" TEXT,
  "sectionTitle" TEXT,
  "headingLevel" INTEGER,
  "startOffset" INTEGER,
  "endOffset" INTEGER,
  CONSTRAINT "ReadDocumentBlock_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReadDocumentBlock_documentId_order_key" ON "ReadDocumentBlock"("documentId", "order");
CREATE INDEX "ReadDocumentBlock_documentId_pageNumber_idx" ON "ReadDocumentBlock"("documentId", "pageNumber");
CREATE INDEX "ReadDocumentBlock_documentId_sectionId_order_idx" ON "ReadDocumentBlock"("documentId", "sectionId", "order");
