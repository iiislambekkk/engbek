import { z } from "zod"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { addVocabularyFromContext } from "@/lib/vocabulary/vocabulary-ai"
import { watchVocabularySourceId } from "@/lib/vocabulary/types"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ mediaId: z.string().min(1), lineId: z.string().min(1), text: z.string().trim().min(1).max(500) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid expression." }, { status: 400 })
  const { mediaId, lineId, text } = parsed.data
  const line = await prisma.watchLine.findFirst({ where: { id: lineId, track: { media: { id: mediaId, userId: session.user.id } } }, include: { track: { include: { media: true } } } })
  if (!line) return Response.json({ error: "Caption not found." }, { status: 404 })
  const sourceId = watchVocabularySourceId(mediaId, line.startMs, text)
  const savedSource = await prisma.vocabularySource.findFirst({
    where: { sourceId, vocabulary: { userId: session.user.id } },
    include: { vocabulary: { select: { term: true } } },
  })
  if (savedSource) return Response.json({ term: savedSource.vocabulary.term, created: false, alreadyInVocabulary: true, newContext: false })
  const result = await addVocabularyFromContext({
    userId: session.user.id,
    term: text,
    context: line.text,
    source: { title: line.track.media.title, url: line.track.media.url, id: sourceId },
  })
  if (result.status === "ambiguous") return Response.json(result)
  revalidatePath("/")
  return Response.json({ status: "added", term: result.term, created: result.created, alreadyInVocabulary: result.alreadyInVocabulary, newContext: result.newContext })
}
