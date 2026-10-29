import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReadReader } from "@/components/read-reader"

export default async function ReadDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const { id } = await params
  const document = await prisma.readDocument.findFirst({ where: { id, userId: session.user.id, format: "EPUB" }, select: { id: true, title: true, author: true, description: true, publisher: true, publishedDate: true, isbn: true, language: true, format: true, positionCfi: true, progress: true, blocks: { orderBy: { order: "asc" }, select: { id: true, order: true, type: true, text: true, pageNumber: true, sectionId: true, sectionTitle: true, headingLevel: true } } } })
  if (!document) notFound()
  const marks = await prisma.markedItem.findMany({ where: { userId: session.user.id, sourceType: "READ", sourceId: document.id }, select: { id: true, text: true, locationAnchor: true } })
  return <ReadReader document={document} initialMarks={marks}/>
}
