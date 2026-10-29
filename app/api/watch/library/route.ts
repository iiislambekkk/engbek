import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { watchError, WatchError } from "@/lib/watch"
import { getWatchCardMetadata } from "@/lib/watch-metadata"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const account = await auth.api.getSession({ headers: request.headers })
    if (!account) throw new WatchError("Sign in to Lexi.", 401)
    const search = new URL(request.url).searchParams
    const serverTime = new Date().toISOString()
    const mediaId = search.get("mediaId")
    if (!mediaId) {
      const page = Math.max(0, Math.min(100000, Number(search.get("page")) || 0))
      const media = await prisma.watchMedia.findMany({
        where: { userId: account.user.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: Math.floor(page) * 30, take: 31,
        include: { sessions: { take: 1, orderBy: { updatedAt: "desc" }, select: { state: true, positionMs: true, updatedAt: true, capturedAt: true } }, _count: { select: { tracks: true } } },
      })
      const items = await Promise.all(media.slice(0, 30).map(async item => {
        if (item.source !== "stremio" || !item.imdbId) return item
        const metadata = await getWatchCardMetadata(item.imdbId, item.season, item.episode)
        if (!metadata) return item
        return {
          ...item,
          title: metadata.title || item.title,
          thumbnail: metadata.poster || item.thumbnail,
          ...metadata,
        }
      }))
      return Response.json({ media: items, hasMore: media.length > 30, serverTime }, { headers: { "Cache-Control": "no-store" } })
    }
    const media = await prisma.watchMedia.findFirst({
      where: { id: mediaId, userId: account.user.id }, include: {
        tracks: { orderBy: { id: "asc" }, include: { _count: { select: { lines: true } } } },
        sessions: { take: 1, orderBy: { updatedAt: "desc" } },
      },
    })
    if (!media) throw new WatchError("Video not found.", 404)
    const cardMetadata = media.source === "stremio" && media.imdbId
      ? await getWatchCardMetadata(media.imdbId, media.season, media.episode)
      : null
    const session = media.sessions[0] ?? null
    const track = media.tracks.find(t => t.id === search.get("trackId"))
      ?? media.tracks.find(t => t.key === session?.activeTrack) ?? media.tracks[0]
    const since = search.get("since")
    if (since && !Number.isFinite(Date.parse(since))) throw new WatchError("Invalid timestamp.")
    const after = search.get("after")
    const lines = track ? await prisma.watchLine.findMany({
      where: { trackId: track.id, ...(since ? { updatedAt: { gte: new Date(Date.parse(since) - 1000) } } : {}), ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" }, take: 501,
    }) : []
    const activeKeys: string[] = session ? JSON.parse(session.activeKeys) : []
    const active = session && activeKeys.length ? await prisma.watchCue.findMany({
      where: { sessionId: session.id, cueKey: { in: activeKeys } }, select: { lineId: true },
    }) : []
    const bookmarkedLineCount = track ? await prisma.watchLine.count({ where: { trackId: track.id, bookmarked: true } }) : 0
    return Response.json({
      media: {
        ...media,
        ...(cardMetadata ? {
          title: cardMetadata.title || media.title,
          thumbnail: cardMetadata.poster || media.thumbnail,
          ...cardMetadata,
        } : {}),
        sessions: undefined,
      }, session, trackId: track?.id ?? null,
      lines: lines.slice(0, 500), next: lines.length > 500 ? lines[499].id : null,
      activeLineIds: active.map(c => c.lineId).filter(Boolean), bookmarkedLineCount, serverTime,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return watchError(error) }
}
