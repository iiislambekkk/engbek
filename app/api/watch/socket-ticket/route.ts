import { createHmac } from "node:crypto"
import { watchDevice, watchError } from "@/lib/watch"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const device = await watchDevice(request)
    const secret = process.env.LEXI_WATCH_BUS_SECRET
    if (!secret) throw new Error("Watch socket is unavailable.")
    const payload = Buffer.from(JSON.stringify({ deviceId: device.id, userId: device.userId, expiresAt: Date.now() + 60_000 })).toString("base64url")
    const signature = createHmac("sha256", secret).update(payload).digest("base64url")
    return Response.json({ ticket: `${payload}.${signature}`, deviceId: device.id }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return watchError(error) }
}
