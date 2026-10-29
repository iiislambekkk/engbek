import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishWatch } from "@/lib/watch-publish"
import { watchError, WatchError } from "@/lib/watch"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const account = await auth.api.getSession({ headers: request.headers })
    if (!account) throw new WatchError("Sign in to Lexi.", 401)
    const body = await request.json() as { mediaId?: unknown; command?: unknown; positionMs?: unknown }
    if (typeof body.mediaId !== "string" || !["play", "pause", "seek"].includes(String(body.command)) || (body.command === "seek" && (!Number.isInteger(body.positionMs) || Number(body.positionMs) < 0 || Number(body.positionMs) > 604_800_000))) throw new WatchError("Invalid playback command.")
    const session = await prisma.watchSession.findFirst({
      where: { userId: account.user.id, mediaId: body.mediaId, state: { in: ["playing", "paused", "seeking", "waiting"] }, capturedAt: { gte: new Date(Date.now() - 15_000) } },
      orderBy: { updatedAt: "desc" }, select: { deviceId: true, mediaId: true, clientSessionId: true },
    })
    if (!session) throw new WatchError("This video is no longer connected.", 409)
    if (!session.clientSessionId) throw new WatchError("This video session cannot receive commands.", 409)
    const device = await prisma.watchDevice.findFirst({ where: { id: session.deviceId, userId: account.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
    if (!device) throw new WatchError("Reconnect the browser to Lexi.", 409)
    await publishWatch(account.user.id, { type: "command", deviceId: device.id, clientSessionId: session.clientSessionId, mediaId: session.mediaId, command: body.command as "play" | "pause" | "seek", ...(body.command === "seek" ? { positionMs: body.positionMs as number } : {}) })
    return Response.json({ sent: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (!(error instanceof WatchError)) console.error("Watch playback command failed", error instanceof Error ? error.name : "Unknown error")
    return watchError(error)
  }
}
