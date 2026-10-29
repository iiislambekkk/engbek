import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { readWatchJson, watchError, WatchError } from "@/lib/watch"
import { publishWatch } from "@/lib/watch-publish"
import { z } from "zod"

export const runtime = "nodejs"

export async function PATCH(request: Request) {
  try {
    if (!isAllowedAppOrigin(request)) throw new WatchError("Forbidden.", 403)
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new WatchError("Sign in to Lexi.", 401)
    const { id, bookmarked } = z.object({ id: z.string().min(1).max(200), bookmarked: z.boolean() }).parse(await readWatchJson(request))
    const result = await prisma.watchLine.updateMany({
      where: { id, track: { media: { userId: session.user.id } } }, data: { bookmarked },
    })
    if (!result.count) throw new WatchError("Caption not found.", 404)
    const line = await prisma.watchLine.findFirst({ where: { id }, include: { track: { include: { media: true } } } })
    if (line) {
      const markedId = `watch-line:${line.id}`
      if (bookmarked) {
        await prisma.markedItem.deleteMany({ where: { id: `legacy-watch-line:${line.id}`, userId: session.user.id } })
        await prisma.markedItem.upsert({
          where: { id: markedId },
          create: { id: markedId, userId: session.user.id, kind: "LINE", text: line.text, context: line.text, sourceType: "WATCH", sourceTitle: line.track.media.title, sourceUrl: line.track.media.url, sourceId: line.track.mediaId, locationLabel: "Playback", locationValue: line.startMs },
          update: {},
        })
      } else await prisma.markedItem.deleteMany({ where: { id: { in: [markedId, `legacy-watch-line:${line.id}`] }, userId: session.user.id } })
    }
    await publishWatch(session.user.id)
    return Response.json({ ok: true })
  } catch (error) { return watchError(error) }
}
