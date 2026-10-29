import { auth } from "@/lib/auth"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(request: Request) {
  if (!isAllowedAppOrigin(request)) return new Response(null, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } })
  if (!session) return new Response(null, { status: 401 })
  const devices = await prisma.watchDevice.findMany({ where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
  return Response.json({ userId: session.user.id, deviceIds: devices.map(device => device.id) }, { headers: { "Cache-Control": "no-store" } })
}
