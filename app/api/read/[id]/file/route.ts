import path from "node:path"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getLegacyLocalPath, getObject } from "@/lib/storage/object-storage"
import { readFile } from "node:fs/promises"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const document = await prisma.readDocument.findFirst({ where: { id, userId: session.user.id, format: "EPUB" }, select: { title: true, filePath: true, mimeType: true, originalFileName: true, coverPath: true } })
  const isCover = new URL(request.url).searchParams.get("cover") === "1"
  const assetPath = isCover ? document?.coverPath : document?.filePath
  if (!document || !assetPath) return Response.json({ error: "Document asset not found." }, { status: 404 })
  const objectKey = assetPath.replace(/\\/g, "/")
  let file: Uint8Array
  let storedContentType: string | undefined
  try {
    const stored = await getObject(objectKey)
    file = stored.body
    storedContentType = stored.contentType
  } catch (error) {
    const status = typeof error === "object" && error !== null && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined
    const isMissing = status === 404 || (error instanceof Error && error.name === "NoSuchKey")
    if (!isMissing) throw error
    try {
      const legacyPath = getLegacyLocalPath(objectKey)
      file = new Uint8Array(await readFile(legacyPath))
    } catch (legacyError) {
      if (legacyError instanceof Error && "code" in legacyError && legacyError.code === "ENOENT") {
        return Response.json({ error: "Document asset not found." }, { status: 404 })
      }
      throw legacyError
    }
  }
  const coverExtension = path.extname(assetPath).toLowerCase()
  const coverMime = coverExtension === ".png" ? "image/png" : coverExtension === ".webp" ? "image/webp" : coverExtension === ".gif" ? "image/gif" : "image/jpeg"
  return new Response(file, { headers: { "Content-Type": isCover ? coverMime : document.mimeType || storedContentType || "application/epub+zip", "Content-Disposition": isCover ? "inline" : `attachment; filename*=UTF-8''${encodeURIComponent(document.originalFileName || document.title)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}
