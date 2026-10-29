import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { readWatchJson, watchError, WatchError } from "@/lib/watch"
import { watchVocabularySourceId } from "@/lib/vocabulary/types"
import { z } from "zod"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new WatchError("Sign in to Lexi.", 401)
    const mediaId = new URL(request.url).searchParams.get("mediaId")
    if (!mediaId) throw new WatchError("Video not found.")
    const expressions = await prisma.watchExpression.findMany({ where: { userId: session.user.id, mediaId }, orderBy: { createdAt: "desc" } })
    const currentSourceIds = expressions.map(expression => watchVocabularySourceId(mediaId, expression.startMs, expression.text))
    const legacySourceIds = expressions.map(expression => `${mediaId}:${expression.startMs}`)
    const savedSources = await prisma.vocabularySource.findMany({
      where: { sourceId: { in: [...currentSourceIds, ...legacySourceIds] }, vocabulary: { userId: session.user.id } },
      select: { sourceId: true },
    })
    const savedSourceIds = new Set(savedSources.map(source => source.sourceId))
    return Response.json({
      expressions: expressions.map(expression => ({
        ...expression,
        inVocabulary: savedSourceIds.has(watchVocabularySourceId(mediaId, expression.startMs, expression.text)) || savedSourceIds.has(`${mediaId}:${expression.startMs}`),
      })),
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return watchError(error) }
}

export async function POST(request: Request) {
  try {
    if (!isAllowedAppOrigin(request)) throw new WatchError("Forbidden.", 403)
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new WatchError("Sign in to Lexi.", 401)
    const input = z.object({ mediaId: z.string().min(1), lineId: z.string().min(1), sessionId: z.string().nullable().optional(), text: z.string().trim().min(1).max(500), startMs: z.number().int().min(0), endMs: z.number().int().min(0) }).parse(await readWatchJson(request))
    const line = await prisma.watchLine.findFirst({ where: { id: input.lineId, track: { media: { id: input.mediaId, userId: session.user.id } } }, include: { track: { include: { media: true } } } })
    if (!line) throw new WatchError("Caption not found.", 404)
    const existing = await prisma.watchExpression.findFirst({ where: { userId: session.user.id, mediaId: input.mediaId, lineId: line.id, text: input.text } })
    const expression = existing ?? await prisma.watchExpression.create({ data: { ...input, userId: session.user.id, sessionId: input.sessionId ?? null, context: line.text, endMs: Math.max(input.startMs, input.endMs) } })
    await prisma.markedItem.upsert({
      where: { id: `watch-expression:${expression.id}` },
      create: { id: `watch-expression:${expression.id}`, userId: session.user.id, kind: "EXPRESSION", text: expression.text, context: expression.context, sourceType: "WATCH", sourceTitle: line.track.media.title, sourceUrl: line.track.media.url, sourceId: input.mediaId, locationLabel: "Playback", locationValue: input.startMs, createdAt: expression.createdAt },
      update: {},
    })
    return Response.json({ expression })
  } catch (error) { return watchError(error) }
}

export async function DELETE(request: Request) {
  try {
    if (!isAllowedAppOrigin(request)) throw new WatchError("Forbidden.", 403)
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new WatchError("Sign in to Lexi.", 401)
    const id = new URL(request.url).searchParams.get("id")
    if (!id) throw new WatchError("Expression not found.")
    const result = await prisma.watchExpression.deleteMany({ where: { id, userId: session.user.id } })
    if (!result.count) throw new WatchError("Expression not found.", 404)
    await prisma.markedItem.deleteMany({ where: { userId: session.user.id, id: { in: [`watch-expression:${id}`, `legacy-watch-expression:${id}`] } } })
    return Response.json({ ok: true })
  } catch (error) { return watchError(error) }
}
