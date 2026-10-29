import { createServer } from "node:http"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import next from "next"
import { WebSocketServer, WebSocket } from "ws"

const dev = !process.argv.includes("--production")
process.env.NODE_ENV = dev ? "development" : "production"
const port = Number(process.env.PORT || 3000)
const busSecret = randomBytes(32).toString("hex")
process.env.LEXI_WATCH_BUS_SECRET = busSecret
process.env.LEXI_WATCH_PORT = String(port)
const app = next({ dev, hostname: "0.0.0.0", port })
await app.prepare()
const handle = app.getRequestHandler()
const upgrade = app.getUpgradeHandler()
const maxWatchMessage = 160 * 1024
const wss = new WebSocketServer({ noServer: true, maxPayload: maxWatchMessage, perMessageDeflate: false })

const server = createServer(async (req, res) => {
  if (req.url?.split("?")[0] !== "/__watch/publish") return handle(req, res)
  if (req.method !== "POST" || req.headers.authorization !== `Bearer ${busSecret}`) {
    res.writeHead(403).end(); return
  }
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > maxWatchMessage) { res.writeHead(413).end(); return }
      chunks.push(chunk)
    }
    const { userId, event } = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (typeof userId !== "string" || !["capture", "changed", "command"].includes(event?.type) || (event.type === "capture" && typeof event.mediaId !== "string") || (event.type === "command" && (typeof event.deviceId !== "string" || typeof event.clientSessionId !== "string" || typeof event.mediaId !== "string" || !["play", "pause", "seek"].includes(event.command) || (event.command === "seek" && (!Number.isInteger(event.positionMs) || event.positionMs < 0))))) {
      res.writeHead(400).end(); return
    }
    const message = JSON.stringify(event)
    if (Buffer.byteLength(message) > maxWatchMessage) { res.writeHead(413).end(); return }
    let delivered = false
    for (const ws of wss.clients) {
      if (ws.userId === userId && ws.readyState === WebSocket.OPEN && (event.type !== "command" || ws.deviceId === event.deviceId)) {
        if (ws.bufferedAmount > maxWatchMessage) ws.terminate()
        else { ws.send(message); if (event.type === "command") delivered = true }
      }
    }
    res.writeHead(event.type === "command" && !delivered ? 409 : 204).end()
  } catch { res.writeHead(400).end() }
})

async function authenticate(req) {
  const ticket = new URL(req.url, `http://127.0.0.1:${port}`).searchParams.get("ticket")
  if (ticket) {
    const [payload, signature] = ticket.split(".")
    if (!payload || !signature) throw new Error("Unauthorized")
    const expected = createHmac("sha256", busSecret).update(payload).digest()
    const actual = Buffer.from(signature, "base64url")
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Unauthorized")
    const identity = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!identity.deviceId || !identity.userId || identity.expiresAt <= Date.now()) throw new Error("Unauthorized")
    const response = await fetch(`http://127.0.0.1:${port}/api/watch/device-check`, { method: "POST", headers: { authorization: `Bearer ${busSecret}`, "content-type": "application/json" }, body: JSON.stringify({ deviceId: identity.deviceId, userId: identity.userId }), signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error("Unauthorized")
    return identity
  }
  const response = await fetch(`http://127.0.0.1:${port}/api/watch/realtime`, {
    headers: { cookie: req.headers.cookie || "", origin: req.headers.origin || "" },
    signal: AbortSignal.timeout(10_000), redirect: "error",
  })
  if (!response.ok) throw new Error("Unauthorized")
  return response.json()
}

server.on("upgrade", async (req, socket, head) => {
  if (req.url?.split("?")[0] !== "/api/watch/socket") return upgrade(req, socket, head)
  const onError = () => socket.destroy()
  socket.on("error", onError)
  try {
    const identity = await authenticate(req)
    if (socket.destroyed) return
    if ([...wss.clients].filter(ws => ws.userId === identity.userId).length >= 10) throw new Error("Too many sockets")
    socket.removeListener("error", onError)
    wss.handleUpgrade(req, socket, head, ws => {
      ws.userId = identity.userId
      ws.deviceId = identity.deviceId
      ws.alive = true
      ws.on("error", () => ws.terminate())
      ws.on("pong", () => { ws.alive = true })
      ws.on("message", () => ws.close(1008, "Read only"))
      ws.send('{"type":"ready"}')
      // Revalidate the real session, including sign-out/revocation, during a long watch.
      const revalidate = setInterval(async () => {
        try { if ((await authenticate(req)).userId !== ws.userId) ws.close(1008) }
        catch { ws.close(1008, "Sign in again") }
      }, 60_000)
      ws.on("close", () => clearInterval(revalidate))
    })
  } catch {
    if (!socket.destroyed) socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n")
  }
})
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue }
    ws.alive = false
    ws.ping()
  }
}, 15_000)
server.listen(port, "0.0.0.0", () => console.log(`Lexi ready on port ${port} (Watch WebSocket enabled)`))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  clearInterval(heartbeat)
  for (const ws of wss.clients) ws.terminate()
  wss.close()
  server.close(() => { void app.close().finally(() => process.exit(0)) })
  setTimeout(() => process.exit(0), 5000).unref()
})
