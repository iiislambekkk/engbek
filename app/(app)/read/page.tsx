import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReadLibrary } from "@/components/read-library"

export default async function ReadPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const [documents, lists] = await Promise.all([
    prisma.readDocument.findMany({ where: { userId: session.user.id, format: "EPUB" }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, format: true, author: true, coverPath: true, originalCoverPath: true, isFavorite: true, bookLists: { select: { listId: true } }, originalFileName: true, fileSizeBytes: true, progress: true, updatedAt: true, _count: { select: { blocks: true } } } }),
    prisma.readBookList.findMany({ where: { userId: session.user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { books: true } } } }),
  ])
  return <ReadLibrary initialDocuments={documents.map(({coverPath,originalCoverPath,bookLists,...document}) => ({ ...document, hasCustomCover:coverPath!==originalCoverPath, listIds: bookLists.map(list=>list.listId), coverUrl:coverPath?`/api/read/${document.id}/file?cover=1`:null, updatedAt: document.updatedAt.toISOString(),progress:Number.isFinite(document.progress)?document.progress:0 }))} initialLists={lists}/>
}
