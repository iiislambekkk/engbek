import { randomBytes } from "node:crypto"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { hashWatchSecret, readWatchJson, WatchError, watchError } from "@/lib/watch"

export const runtime = "nodejs"

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(80), tokenHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal("status"), deviceCode: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal("approve"), code: z.string().regex(/^[A-F0-9]{10}$/) }),
])

export async function POST(request: Request) {
  try {
    const body = input.parse(await readWatchJson(request))
    const now = new Date()
    if (body.action === "create") {
      await prisma.watchPairing.deleteMany({ where: { expiresAt: { lt: now } } })
      const recent = await prisma.watchPairing.count({ where: { createdAt: { gt: new Date(Date.now() - 60_000) } } })
      if (recent >= 30) throw new WatchError("Too many connection attempts. Try again in a minute.", 429)
      const deviceCode = randomBytes(32).toString("hex")
      const code = randomBytes(5).toString("hex").toUpperCase()
      const expiresAt = new Date(Date.now() + 10 * 60_000)
      await prisma.watchPairing.create({ data: { id: hashWatchSecret(deviceCode), code, tokenHash: body.tokenHash, name: body.name, expiresAt } })
      return Response.json({ deviceCode, code, expiresAt }, { headers: { "Cache-Control": "no-store" } })
    }
    if (body.action === "status") {
      const pairing = await prisma.watchPairing.findUnique({ where: { id: hashWatchSecret(body.deviceCode) } })
      if (!pairing || pairing.expiresAt <= now) throw new WatchError("Connection request expired. Start again.", 410)
      return Response.json({ approved: !!pairing.approvedAt }, { headers: { "Cache-Control": "no-store" } })
    }
    if (!isAllowedAppOrigin(request)) throw new WatchError("Forbidden.", 403)
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new WatchError("Sign in to Lexi first.", 401)
    await prisma.$transaction(async tx => {
      const pairing = await tx.watchPairing.findUnique({ where: { code: body.code } })
      if (!pairing || pairing.expiresAt <= now) throw new WatchError("Connection request expired or does not exist.", 410)
      const consumed = await tx.watchPairing.updateMany({ where: { id: pairing.id, approvedAt: null, expiresAt: { gt: now } }, data: { approvedAt: now } })
      if (consumed.count !== 1) throw new WatchError("This connection request has already been approved.", 409)
      await tx.watchDevice.create({ data: { userId: session.user.id, name: pairing.name, tokenHash: pairing.tokenHash, expiresAt: new Date(Date.now() + 90 * 86_400_000) } })
    })
    return Response.json({ approved: true })
  } catch (error) { return watchError(error) }
}
