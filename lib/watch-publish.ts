import "server-only"
import { WatchError } from "@/lib/watch"

export type WatchPush = {
  type: "capture"
  mediaId: string
  trackId: string | null
  lines: Array<{ id: string; trackId: string; text: string; startMs: number; endMs: number; approximate: boolean; bookmarked: boolean; updatedAt: string }>
  session: { id: string; positionMs: number; durationMs: number | null; state: string; updatedAt: string; capturedAt: string | null; playbackRate: number; activeKeys: string }
  activeLineIds: string[]
  serverTime: string
}
export type WatchCommand = { type: "command"; deviceId: string; clientSessionId: string; mediaId: string; command: "play" | "pause" | "seek"; positionMs?: number }

// The custom HTTP server owns the sockets; Next's route workers notify it locally.
export async function publishWatch(userId: string, event: WatchPush | WatchCommand | { type: "changed" } = { type: "changed" }) {
  const secret = process.env.LEXI_WATCH_BUS_SECRET
  const port = process.env.LEXI_WATCH_PORT
  if (!secret || !port) return
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__watch/publish`, {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ userId, event }), signal: AbortSignal.timeout(1000),
    })
    if (event.type === "command" && response.status === 409) throw new WatchError("The browser is not connected to Watch. Update/re-enable the Tampermonkey script and try again.", 409)
    if (event.type === "command" && !response.ok) throw new WatchError("The Watch command channel is outdated. Restart the Lexi server, then update/re-enable the Tampermonkey script.", 503)
  } catch (error) {
    if (event.type === "command") {
      if (error instanceof WatchError) throw error
      throw new WatchError("Could not reach the Watch command channel. Restart the Lexi server and try again.", 503)
    }
    // Committed captures remain available via the reconnect snapshot/fallback.
  }
}
