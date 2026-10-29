import { randomUUID } from "node:crypto"
import path from "node:path"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extractEpubDocument } from "@/lib/read-documents"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { deleteObject, putObject } from "@/lib/storage/object-storage"

export const runtime = "nodejs"
const MAX_BYTES = 25 * 1024 * 1024

type BookMetadata = { title?: string; author?: string; description?: string; publisher?: string; publishedDate?: string; isbn?: string; language?: string }
type ExternalBook = { volumeInfo?: BookMetadata & { authors?: string[]; imageLinks?: { thumbnail?: string; smallThumbnail?: string }; industryIdentifiers?: { type: string; identifier: string }[] } }
function normalizeTitle(value: string) { return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() }
async function lookupBook(metadata: BookMetadata) {
  const query = metadata.isbn ? `isbn:${metadata.isbn}` : `intitle:${metadata.title || ""}${metadata.author ? `+inauthor:${metadata.author}` : ""}`
  if (!query.replace(/isbn:|intitle:|inauthor:|\+/g, "").trim()) return null
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books`, { signal: AbortSignal.timeout(4500), headers: { Accept: "application/json" } })
    if (!response.ok) return null
    const result = await response.json() as { items?: ExternalBook[] }
    const wantedTitle = normalizeTitle(metadata.title || "")
    const item = result.items?.find(candidate => {
      const candidateTitle = normalizeTitle(candidate.volumeInfo?.title || "")
      return !wantedTitle || candidateTitle === wantedTitle || candidateTitle.startsWith(wantedTitle) || wantedTitle.startsWith(candidateTitle)
    })
    const info = item?.volumeInfo
    if (!info) return null
    return {
      metadata: { title: metadata.title || info.title, author: metadata.author || info.authors?.join(", "), description: metadata.description || info.description, publisher: metadata.publisher || info.publisher, publishedDate: metadata.publishedDate || info.publishedDate, isbn: metadata.isbn || info.industryIdentifiers?.find(identifier => identifier.type === "ISBN_13")?.identifier || info.industryIdentifiers?.find(identifier => identifier.type === "ISBN_10")?.identifier, language: metadata.language || info.language },
      coverUrl: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null,
    }
  } catch { return null }
}

async function downloadCover(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || !["books.google.com", "books.googleusercontent.com"].includes(parsed.hostname)) return null
    const response = await fetch(parsed, { signal: AbortSignal.timeout(4500) })
    const mimeType = response.headers.get("content-type")?.split(";")[0] || ""
    if (!response.ok || !mimeType.startsWith("image/") || Number(response.headers.get("content-length") || 0) > 8 * 1024 * 1024) return null
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > 8 * 1024 * 1024) return null
    const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg"
    return { data, mimeType, extension }
  } catch { return null }
}

async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user?.id
}

export async function GET(request: Request) {
  const userId = await currentUser(request)
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const documents = await prisma.readDocument.findMany({ where: { userId, format: "EPUB" }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, format: true, author: true, originalFileName: true, fileSizeBytes: true, positionType: true, positionCfi: true, progress: true, coverPath: true, originalCoverPath: true, isFavorite: true, bookLists: { select: { listId: true } }, updatedAt: true, _count: { select: { blocks: true } } } })
  return Response.json({ documents: documents.map(({coverPath,originalCoverPath,bookLists,...document})=>({...document,hasCustomCover:coverPath!==originalCoverPath,listIds:bookLists.map(list=>list.listId),coverUrl:coverPath?`/api/read/${document.id}/file?cover=1`:null,progress:Number.isFinite(document.progress)?document.progress:0})) })
}

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const userId = await currentUser(request)
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return Response.json({ error: "Choose an EPUB file." }, { status: 400 })
  if (file.size < 1 || file.size > MAX_BYTES) return Response.json({ error: "Files must be between 1 byte and 25 MB." }, { status: 413 })
  const originalFileName = file.name.replace(/[\\/]/g, "_").slice(0, 240)
  const extension = path.extname(originalFileName).toLowerCase()
  if (extension !== ".epub") return Response.json({ error: "Only EPUB books are supported." }, { status: 415 })
  const id = randomUUID()
  const buffer = Buffer.from(await file.arrayBuffer())
  let extracted
  try { extracted = extractEpubDocument(buffer, id) }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read this document.", code: "EPUB_EXTRACTION_FAILED" }, { status: 422 }) }
  const relativePath = `${userId}/${id}.epub`
  let coverRelativePath: string | null = null
  try {
    const metadata = extracted.metadata as BookMetadata
    const needsExternalMetadata = !metadata.title || !metadata.author || !metadata.description
    const external = !extracted.cover || needsExternalMetadata ? await lookupBook(metadata) : null
    const enriched = { ...metadata, ...external?.metadata }
    const externalCover = extracted.cover ? null : external?.coverUrl ? await downloadCover(external.coverUrl) : null
    const cover = extracted.cover ? { ...extracted.cover, extension: extracted.cover.mimeType === "image/png" ? ".png" : extracted.cover.mimeType === "image/webp" ? ".webp" : ".jpg" } : externalCover
    coverRelativePath = cover ? `${userId}/${id}.cover${cover.extension}` : null
    await putObject(relativePath, buffer, file.type || "application/epub+zip")
    if (cover && coverRelativePath) await putObject(coverRelativePath, cover.data, cover.mimeType)
    const document = await prisma.readDocument.create({ data: { id, userId, title: (String(form?.get("title") ?? "").trim() || enriched.title || path.basename(originalFileName, extension)).slice(0, 300), format: "EPUB", filePath: relativePath, originalFileName, mimeType: file.type || null, fileSizeBytes: file.size, author: enriched.author || null, description: enriched.description || null, publisher: enriched.publisher || null, publishedDate: enriched.publishedDate || null, isbn: enriched.isbn || null, language: enriched.language || null, coverPath: coverRelativePath, originalCoverPath: coverRelativePath, extractedText: extracted.text, metadata: { ...extracted.metadata, ...enriched }, blocks: { create: extracted.blocks } }, select: { id: true, title: true, format: true, author: true, progress: true, isFavorite: true, _count: { select: { blocks: true } } } })
    return Response.json({ document: { ...document, hasCustomCover: false, isFavorite: false, listIds: [], coverUrl: coverRelativePath ? `/api/read/${id}/file?cover=1` : null } }, { status: 201 })
  } catch (error) { await deleteObject(relativePath).catch(() => {}); if (coverRelativePath) await deleteObject(coverRelativePath).catch(() => {}); throw error }
}

export async function PATCH(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const userId = await currentUser(request)
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const body = await request.json().catch(() => null) as { id?: string; cfi?: string; progress?: number } | null
  if (!body?.id || !body.cfi?.startsWith("epubcfi(")) return Response.json({ error: "Invalid EPUB reading position." }, { status: 400 })
  const doc = await prisma.readDocument.findFirst({ where: { id: body.id, userId, format: "EPUB" }, select: { id: true } })
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 })
  await prisma.readDocument.update({ where: { id: doc.id }, data: { positionType: "CFI", positionCfi: body.cfi.slice(0, 2000), progress: Math.max(0, Math.min(1, body.progress ?? 0)) } })
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const userId = await currentUser(request)
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return Response.json({ error: "Document ID is required." }, { status: 400 })
  const document = await prisma.readDocument.findFirst({ where: { id, userId }, select: { id: true, filePath: true, coverPath: true } })
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 })
  await prisma.readDocument.delete({ where: { id: document.id } })
  if (document.filePath) await deleteObject(document.filePath.replace(/\\/g, "/")).catch(() => {})
  if (document.coverPath) await deleteObject(document.coverPath.replace(/\\/g, "/")).catch(() => {})
  return Response.json({ ok: true })
}
