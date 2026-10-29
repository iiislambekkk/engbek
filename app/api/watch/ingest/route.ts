import { prisma } from "@/lib/prisma"
import { captureSchema, readWatchJson, watchDevice, watchError, WatchError } from "@/lib/watch"
import { publishWatch, type WatchPush } from "@/lib/watch-publish"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const device = await watchDevice(request)
    const body = captureSchema.parse(await readWatchJson(request))
    const result = await prisma.$transaction(async tx => {
      const now = new Date()
      // Recheck inside the transaction so revocation also stops in-flight captures.
      const active = await tx.watchDevice.findFirst({ where: { id: device.id, revokedAt: null, expiresAt: { gt: now } } })
      if (!active) throw new WatchError("Browser connection was revoked.", 401)
      const sourceId = body.media.source === "stremio" && body.media.imdbId
        ? `${body.media.imdbId}:${body.media.season ?? ""}:${body.media.episode ?? ""}` : body.media.sourceId
      const mediaData = { ...body.media, sourceId }
      let media = await tx.watchMedia.upsert({
        where: { userId_source_sourceId: { userId: device.userId, source: body.media.source, sourceId } },
        create: { ...mediaData, userId: device.userId },
        update: {},
      })
      const metadataChanged =
        (!!body.media.title && media.title !== body.media.title) ||
        (!!body.media.url && media.url !== body.media.url) ||
        (!!body.media.thumbnail && media.thumbnail !== body.media.thumbnail) ||
        (body.media.durationMs !== null && media.durationMs !== body.media.durationMs) ||
        (body.media.imdbId !== null && media.imdbId !== body.media.imdbId) ||
        (body.media.season !== null && media.season !== body.media.season) ||
        (body.media.episode !== null && media.episode !== body.media.episode)
      const refreshHistory = body.cues.length > 0 && now.getTime() - media.updatedAt.getTime() >= 10_000
      if (metadataChanged || refreshHistory) {
        media = await tx.watchMedia.update({
          where: { id: media.id },
          data: {
            title: body.media.title || undefined,
            url: body.media.url || undefined,
            thumbnail: body.media.thumbnail || undefined,
            durationMs: body.media.durationMs ?? undefined,
            imdbId: body.media.imdbId ?? undefined,
            season: body.media.season ?? undefined,
            episode: body.media.episode ?? undefined,
          },
        })
      }
      const session = await tx.watchSession.upsert({
        where: { deviceId_clientSessionId: { deviceId: device.id, clientSessionId: body.clientSessionId } },
        create: { deviceId: device.id, userId: device.userId, clientSessionId: body.clientSessionId, mediaId: media.id, ...mediaData },
        update: {},
      })
      if (session.source !== body.media.source || session.sourceId !== sourceId) throw new WatchError("Start a new session for this video.", 409)
      await tx.watchSession.updateMany({
        where: { id: session.id, sequence: { lt: body.sequence } },
        data: {
          ...mediaData, mediaId: media.id, sequence: body.sequence, state: body.state, positionMs: body.positionMs,
          capturedAt: body.capturedAt ? new Date(body.capturedAt) : now, playbackRate: body.playbackRate,
          activeTrack: body.activeTrack ?? body.cues.at(-1)?.track ?? session.activeTrack,
          activeKeys: JSON.stringify(body.activeKeys ?? []),
        },
      })
      const trackCache = new Map<string, Awaited<ReturnType<typeof tx.watchTrack.upsert>>>()
      const publishedLines = new Map<string, WatchPush["lines"][number]>()
      for (const cue of body.cues) {
        const existing = await tx.watchCue.findUnique({ where: { sessionId_cueKey: { sessionId: session.id, cueKey: cue.cueKey } } })
        if (existing && cue.revision <= existing.revision && existing.lineId) continue
        let track = trackCache.get(cue.track)
        if (!track) {
          track = await tx.watchTrack.upsert({
            where: { mediaId_key: { mediaId: media.id, key: cue.track } },
            create: { mediaId: media.id, key: cue.track, language: cue.language }, update: {},
          })
          trackCache.set(cue.track, track)
        }
        let line = existing?.lineId ? await tx.watchLine.findUnique({ where: { id: existing.lineId } })
          : await tx.watchLine.findUnique({ where: { trackId_key: { trackId: track.id, key: cue.cueKey } } })
        if (!line && cue.approximate) {
          const nearby = await tx.watchLine.findMany({ where: {
            trackId: track.id, approximate: true, startMs: { lte: cue.endMs + 1500 }, endMs: { gte: cue.startMs - 1500 },
          }, orderBy: { startMs: "asc" }, take: 40 })
          // Only merge matching text at the same observed moment, never repeated dialogue elsewhere.
          line = nearby.find(old => old.text === cue.text || cue.text.startsWith(old.text + " ") || old.text.startsWith(cue.text + " ")) ?? null
        }
        const values = {
          text: line && cue.approximate && line.text.startsWith(cue.text + " ") ? line.text : cue.text,
          startMs: line && cue.approximate ? Math.min(line.startMs, cue.startMs) : cue.startMs,
          endMs: line && cue.approximate ? Math.max(line.endMs, cue.endMs) : cue.endMs,
          approximate: cue.approximate,
        }
        line = line ? await tx.watchLine.update({ where: { id: line.id }, data: values })
          : await tx.watchLine.create({ data: { trackId: track.id, key: cue.cueKey, ...values } })
        publishedLines.set(line.id, {
          id: line.id, trackId: line.trackId, text: line.text, startMs: line.startMs, endMs: line.endMs,
          approximate: line.approximate, bookmarked: line.bookmarked, updatedAt: line.updatedAt.toISOString(),
        })
        if (!existing) await tx.watchCue.create({ data: { sessionId: session.id, ...cue, lineId: line.id } })
        else await tx.watchCue.update({ where: { id: existing.id }, data: { ...cue, lineId: line.id } })
      }
      if (!active.lastSeenAt || now.getTime() - active.lastSeenAt.getTime() >= 60_000) {
        await tx.watchDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } })
      }
      const latestSession = await tx.watchSession.findUniqueOrThrow({ where: { id: session.id } })
      const activeKeys: string[] = JSON.parse(latestSession.activeKeys)
      const activeCues = activeKeys.length ? await tx.watchCue.findMany({
        where: { sessionId: session.id, cueKey: { in: activeKeys } }, select: { lineId: true },
      }) : []
      const activeTrack = latestSession.activeTrack ? await tx.watchTrack.findUnique({
        where: { mediaId_key: { mediaId: media.id, key: latestSession.activeTrack } }, select: { id: true },
      }) : null
      const event: WatchPush = {
        type: "capture", mediaId: media.id, trackId: activeTrack?.id ?? null,
        lines: [...publishedLines.values()],
        session: {
          id: latestSession.id, positionMs: latestSession.positionMs, durationMs: latestSession.durationMs,
          state: latestSession.state, updatedAt: latestSession.updatedAt.toISOString(),
          capturedAt: latestSession.capturedAt?.toISOString() ?? null,
          playbackRate: latestSession.playbackRate, activeKeys: latestSession.activeKeys,
        },
        activeLineIds: activeCues.map(cue => cue.lineId).filter((id): id is string => id !== null),
        serverTime: now.toISOString(),
      }
      return { sessionId: session.id, acceptedSequence: body.sequence, event }
    })
    void publishWatch(device.userId, result.event)
    return Response.json({ sessionId: result.sessionId, acceptedSequence: result.acceptedSequence }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return watchError(error) }
}
