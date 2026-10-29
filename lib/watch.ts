import "server-only"

import { createHash } from "node:crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

export const hashWatchSecret = (value: string) => createHash("sha256").update(value).digest("hex")

export class WatchError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function readWatchJson(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new WatchError("Missing request body.")
  const parts: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 128 * 1024) {
      await reader.cancel()
      throw new WatchError("Request is too large.", 413)
    }
    parts.push(value)
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown }
  catch { throw new WatchError("Invalid JSON.") }
}

export function watchError(error: unknown) {
  if (error instanceof WatchError) return Response.json({ error: error.message }, { status: error.status })
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid capture data." }, { status: 400 })
  console.error("Watch request failed", error instanceof Error ? error.name : "Unknown error")
  return Response.json({ error: "Could not process the request. Please retry." }, { status: 500 })
}

export async function watchDevice(request: Request) {
  const authorization = request.headers.get("authorization") ?? ""
  if (!/^Bearer lexi_watch_[a-f0-9]{64}$/.test(authorization)) throw new WatchError("Reconnect this browser to Lexi.", 401)
  const device = await prisma.watchDevice.findUnique({ where: { tokenHash: hashWatchSecret(authorization.slice(7)) } })
  if (!device || device.revokedAt || device.expiresAt <= new Date()) throw new WatchError("Browser connection expired or was revoked. Reconnect to Lexi.", 401)
  return device
}

const milliseconds = z.number().int().min(0).max(604_800_000)
const httpsUrl = z.string().max(2048).url().refine(value => new URL(value).protocol === "https:")

export const captureSchema = z.object({
  clientSessionId: z.string().uuid(),
  sequence: z.number().int().min(0).max(2_000_000_000),
  media: z.object({
    source: z.enum(["youtube", "stremio"]),
    sourceId: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    url: httpsUrl,
    thumbnail: httpsUrl.nullable(),
    durationMs: milliseconds.nullable(),
    imdbId: z.string().regex(/^tt\d{5,12}$/).nullable(),
    season: z.number().int().min(0).max(1000).nullable(),
    episode: z.number().int().min(0).max(10000).nullable(),
  }).refine(media => {
    const host = new URL(media.url).hostname
    return media.source === "youtube" ? ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(host) : host === "web.stremio.com"
  }),
  positionMs: milliseconds,
  state: z.enum(["playing", "paused", "seeking", "ended", "stopped", "waiting"]),
  capturedAt: z.string().datetime().optional(),
  playbackRate: z.number().min(0.1).max(16).default(1),
  activeTrack: z.string().max(200).nullable().optional(),
  activeKeys: z.array(z.string().max(128)).max(50).optional(),
  cues: z.array(z.object({
    cueKey: z.string().min(1).max(128),
    track: z.string().min(1).max(200),
    language: z.string().max(40).nullable(),
    text: z.string().trim().min(1).max(8000),
    startMs: milliseconds,
    endMs: milliseconds,
    approximate: z.boolean(),
    revision: z.number().int().min(0).max(2_000_000_000),
  }).refine(cue => cue.endMs >= cue.startMs)).max(50),
})
