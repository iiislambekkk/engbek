import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "node:crypto"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { deleteObject, putObject } from "@/lib/storage/object-storage"

export const runtime = "nodejs"
const MAX_COVER_BYTES = 8 * 1024 * 1024
const coverExtensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const document = await prisma.readDocument.findFirst({ where: { id, userId: session.user.id, format: "EPUB" }, include: { blocks: { orderBy: { order: "asc" }, select: { id: true, order: true, type: true, text: true, pageNumber: true, sectionId: true, sectionTitle: true, headingLevel: true, startOffset: true, endOffset: true } } } })
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 })
  return Response.json({ document })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const existing = await prisma.readDocument.findFirst({ where: { id, userId: session.user.id, format: "EPUB" }, select: { id: true, coverPath: true, originalCoverPath: true } })
  if (!existing) return Response.json({ error: "Document not found." }, { status: 404 })
  const contentType = request.headers.get("content-type") || ""
  let title: string | undefined
  let cover: FormDataEntryValue | null = null
  let resetCover = false
  let favorite: boolean | undefined
  let listIds: string[] | undefined
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as { favorite?: unknown; listIds?: unknown } | null
    if (!body) return Response.json({ error: "Invalid request." }, { status: 400 })
    if (typeof body.favorite === "boolean") favorite = body.favorite
    if (Array.isArray(body.listIds) && body.listIds.every(value => typeof value === "string")) listIds = [...new Set(body.listIds)] as string[]
    if (favorite === undefined && listIds === undefined) return Response.json({ error: "No book changes provided." }, { status: 400 })
  } else {
    const form = await request.formData().catch(() => null)
    if (!form) return Response.json({ error: "Invalid form data." }, { status: 400 })
    title = String(form.get("title") ?? "").trim()
    if (!title || title.length > 300) return Response.json({ error: "Title must be between 1 and 300 characters." }, { status: 400 })
    resetCover = form.get("resetCover") === "true"
    cover = form.get("cover")
  }
  if (resetCover && cover instanceof File && cover.size > 0) return Response.json({ error: "Choose a cover image or reset to the original cover, not both." }, { status: 400 })
  let coverPath: string | undefined
  if (cover instanceof File && cover.size > 0) {
    const extension = coverExtensions[cover.type]
    if (!extension) return Response.json({ error: "Use a JPEG, PNG, WebP, or GIF image." }, { status: 415 })
    if (cover.size > MAX_COVER_BYTES) return Response.json({ error: "Cover images must be 8 MB or smaller." }, { status: 413 })
    coverPath = `${session.user.id}/${id}.${randomUUID()}.cover${extension}`
    await putObject(coverPath, new Uint8Array(await cover.arrayBuffer()), cover.type)
  }
  try {
    if (listIds) {
      const ownedLists = await prisma.readBookList.count({ where: { id: { in: listIds }, userId: session.user.id } })
      if (ownedLists !== listIds.length) throw new Error("BOOK_LIST_NOT_FOUND")
    }
    const newCoverPath = coverPath || (resetCover ? existing.originalCoverPath : undefined)
    const document = await prisma.$transaction(async transaction => {
      const updated = await transaction.readDocument.update({ where: { id }, data: { ...(title ? { title } : {}), ...(favorite !== undefined ? { isFavorite: favorite } : {}), ...(coverPath || resetCover ? { coverPath: newCoverPath } : {}) }, select: { id: true, title: true, coverPath: true, isFavorite: true } })
      if (listIds) {
        await transaction.readBookListEntry.deleteMany({ where: { documentId: id } })
        if (listIds.length) await transaction.readBookListEntry.createMany({ data: listIds.map(listId => ({ listId, documentId: id })) })
      }
      return updated
    })
    if ((coverPath || resetCover) && existing.coverPath && existing.coverPath !== document.coverPath && existing.coverPath !== existing.originalCoverPath) await deleteObject(existing.coverPath.replace(/\\/g, "/")).catch(() => {})
    return Response.json({ document: { id: document.id, title: document.title, isFavorite: document.isFavorite, hasCustomCover: document.coverPath !== existing.originalCoverPath, coverUrl: document.coverPath ? `/api/read/${document.id}/file?cover=1&v=${encodeURIComponent(document.coverPath)}` : null, ...(listIds ? { listIds } : {}) } })
  } catch (error) {
    if (coverPath) await deleteObject(coverPath).catch(() => {})
    if (error instanceof Error && error.message === "BOOK_LIST_NOT_FOUND") return Response.json({ error: "One or more lists were not found." }, { status: 400 })
    throw error
  }
}
