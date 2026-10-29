import { z } from "zod"
import { revalidatePath } from "next/cache"
import { VocabularyAddReason } from "@/app/generated/prisma"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { addVocabularyFromSelection, createVocabularyEntryFromContext } from "@/lib/vocabulary/vocabulary-ai"

export const runtime = "nodejs"

const addSchema = z.object({
  action: z.enum(["add", "sources"]).optional().default("add"),
  term: z.string().trim().min(1).max(500),
  context: z.string().trim().max(5000).optional().default(""),
  guidance: z.string().trim().max(2000).optional(),
  candidate: z.string().trim().min(1).max(120).optional(),
  source: z.object({ title: z.string().max(300).optional(), url: z.string().url().max(2000).optional(), id: z.string().max(500).optional() }).optional(),
  allowSimilar: z.boolean().optional().default(false),
})

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = addSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid vocabulary entry." }, { status: 400 })
  const { action, term, context, guidance, candidate, source, allowSimilar } = parsed.data

  if (action === "sources") {
    const normalizedTerm = term.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
    const exactEntries = await prisma.vocabularyItem.findMany({
      where: { userId: session.user.id, normalizedTerm },
      select: {
        id: true,
        term: true,
        sources: { orderBy: { createdAt: "desc" }, select: { sourceId: true, reason: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    })
    const linkedEntries = source?.id ? await prisma.vocabularyItem.findMany({
      where: { userId: session.user.id, sources: { some: { sourceId: source.id } } },
      select: {
        id: true,
        term: true,
        sources: { orderBy: { createdAt: "desc" }, select: { sourceId: true, reason: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    }) : []
    const entries = [...new Map([...exactEntries, ...linkedEntries].map(entry => [entry.id, entry])).values()]
    const markedIds = [...new Set(entries.flatMap(entry => entry.sources.map(source => source.sourceId).filter((id): id is string => Boolean(id && id.startsWith("marked:") )).map(id => id.slice("marked:".length))))]
    const markedItems = markedIds.length ? await prisma.markedItem.findMany({ where: { userId: session.user.id, id: { in: markedIds } }, select: { id: true, text: true, sourceTitle: true } }) : []
    const markedById = new Map(markedItems.map(item => [item.id, item]))
    const withLabels = entries.map(entry => ({ ...entry, sources: entry.sources.map(source => {
      const marked = source.sourceId?.startsWith("marked:") ? markedById.get(source.sourceId.slice("marked:".length)) : null
      return { ...source, label: marked ? `${marked.text} · ${marked.sourceTitle}` : source.sourceId?.startsWith("watch:") ? "Watch" : source.sourceId ? "Another source" : "Added manually" }
    }) }))
    return Response.json({ status: "sources", entries: withLabels })
  }

  try {
    const result = candidate
      ? await createVocabularyEntryFromContext({ userId: session.user.id, term: candidate, context, guidance, source, reason: VocabularyAddReason.USER_REQUEST, allowSimilar })
      : await addVocabularyFromSelection({ userId: session.user.id, term, context, guidance, source, reason: VocabularyAddReason.USER_REQUEST, allowSimilar })
    if (result.status === "ambiguous") return Response.json(result)
    if (result.status === "similar") return Response.json(result)
    revalidatePath("/")
    return Response.json({ status: "added", term: result.term, created: result.created, alreadyInVocabulary: result.alreadyInVocabulary, newContext: result.newContext })
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Could not add this entry to Vocabulary." }, { status: 500 })
  }
}
