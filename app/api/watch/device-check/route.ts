import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.LEXI_WATCH_BUS_SECRET}`) return new Response(null, { status: 403 })
  const body = await request.json() as { deviceId?: unknown; userId?: unknown }
  if (typeof body.deviceId !== "string" || typeof body.userId !== "string") return new Response(null, { status: 400 })
  const device = await prisma.watchDevice.findFirst({ where: { id: body.deviceId, userId: body.userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
  return new Response(null, { status: device ? 204 : 401 })
}
