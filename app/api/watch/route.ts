import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { readWatchJson, watchDevice, WatchError, watchError } from "@/lib/watch"
import { z } from "zod"
import { publishWatch } from "@/lib/watch-publish"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const [devices, captures] = await Promise.all([
    prisma.watchDevice.findMany({ where: { userId: session.user.id, revokedAt: null }, select: { id: true, name: true, createdAt: true, lastSeenAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.watchSession.findMany({ where: { userId: session.user.id }, take: 5, orderBy: { updatedAt: "desc" }, include: { _count: { select: { cues: true } }, cues: { take: 3, orderBy: { startMs: "desc" } } } }),
  ])
  return Response.json({ devices, captures }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: Request) {
  try {
    const { deviceId } = z.object({ deviceId: z.string().min(1).max(100) }).parse(await readWatchJson(request))
    let userId: string
    if (request.headers.get("authorization")?.startsWith("Bearer ")) {
      const device = await watchDevice(request)
      if (device.id !== deviceId) throw new WatchError("Forbidden.", 403)
      userId = device.userId
    } else {
      if (!isAllowedAppOrigin(request)) throw new WatchError("Forbidden.", 403)
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session) throw new WatchError("Sign in to Lexi.", 401)
      userId = session.user.id
    }
    await prisma.$transaction([
      prisma.watchDevice.updateMany({ where: { id: deviceId, userId }, data: { revokedAt: new Date() } }),
      prisma.watchSession.updateMany({ where: { deviceId, userId }, data: { state: "stopped" } }),
    ])
    await publishWatch(userId)
    return Response.json({ ok: true })
  } catch (error) { return watchError(error) }
}
