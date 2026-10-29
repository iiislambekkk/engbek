import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs"
import { resolve, join, dirname } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { randomBytes, createHash } from "node:crypto"
import ts from "typescript"
import Database from "better-sqlite3"

// Load the actual Next route functions against a temporary SQLite database.
// Only Next's build-time server-only marker is replaced; auth and Prisma are real.
const root = resolve(import.meta.dirname, "..")
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true }
    let filename
    if (specifier.startsWith("@/")) filename = resolve(root, specifier.slice(2))
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) filename = fileURLToPath(new URL(specifier, context.parentURL))
    if (filename && existsSync(filename + ".ts")) return { url: pathToFileURL(filename + ".ts").href, shortCircuit: true }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts") && !url.includes("node_modules")) {
      return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

test("Watch pairing, account isolation, capture retries and revocation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "lexi-watch-test-"))
  const databasePath = join(directory, "watch.db")
  process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`
  process.env.BETTER_AUTH_URL = "http://localhost:3000"
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex")
  process.env.GOOGLE_CLIENT_ID = "test-client"
  process.env.GOOGLE_CLIENT_SECRET = "test-secret"
  const db = new Database(databasePath)
  for (const name of readdirSync(join(root, "prisma/migrations")).sort()) {
    const migration = join(root, "prisma/migrations", name, "migration.sql")
    if (existsSync(migration)) db.exec(readFileSync(migration, "utf8"))
  }
  db.close()
  const { prisma } = await import("../lib/prisma.ts")
  const { auth } = await import("../lib/auth.ts")
  const pair = await import("../app/api/watch/pair/route.ts")
  const ingest = await import("../app/api/watch/ingest/route.ts")
  const overview = await import("../app/api/watch/route.ts")
  const { hashWatchSecret } = await import("../lib/watch.ts")
  const appOrigin = "http://192.168.8.63:3000"
  const req = (path, data, headers = {}, method = "POST") => new Request(`http://localhost:3000${path}`, {
    method, headers: { "content-type": "application/json", ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  async function account(email) {
    const response = await auth.handler(req("/api/auth/sign-up/email", { name: "Watch test", email, password: "test-password-long-enough" }, { origin: "http://localhost:3000" }))
    assert.equal(response.status, 200, await response.clone().text())
    return response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ")
  }
  try {
    const cookie = await account("one@example.com")
    const otherCookie = await account("two@example.com")
    const token = "lexi_watch_" + randomBytes(32).toString("hex")
    const hash = createHash("sha256").update(token).digest("hex")
    const created = await pair.POST(req("/api/watch/pair", { action: "create", name: "Test browser", tokenHash: hash }))
    assert.equal(created.status, 200)
    const pairing = await created.json()
    const approval = { action: "approve", code: pairing.code }
    assert.equal((await pair.POST(req("/api/watch/pair", approval, { origin: appOrigin }))).status, 401)
    assert.equal((await pair.POST(req("/api/watch/pair", approval, { cookie, origin: "https://untrusted.example" }))).status, 403)
    assert.equal((await pair.POST(req("/api/watch/pair", approval, { cookie, origin: appOrigin }))).status, 200)
    assert.equal((await pair.POST(req("/api/watch/pair", approval, { cookie: otherCookie, origin: appOrigin }))).status, 409)
    assert.equal((await (await pair.POST(req("/api/watch/pair", { action: "status", deviceCode: pairing.deviceCode }))).json()).approved, true)
    const device = await prisma.watchDevice.findUniqueOrThrow({ where: { tokenHash: hash } })
    assert.equal(device.tokenHash, hashWatchSecret(token))
    const capture = {
      clientSessionId: crypto.randomUUID(), sequence: 1,
      media: { source: "youtube", sourceId: "test-video", title: "A video", url: "https://www.youtube.com/watch?v=test-video", thumbnail: null, durationMs: 60_000, imdbId: null, season: null, episode: null },
      positionMs: 2000, state: "playing",
      cues: [{ cueKey: "first-cue", track: "en", language: "en", text: "Hello there", startMs: 1000, endMs: 3000, approximate: false, revision: 0 }],
    }
    const bearer = { authorization: `Bearer ${token}` }
    assert.equal((await ingest.POST(req("/api/watch/ingest", capture))).status, 401)
    for (let attempt = 0; attempt < 2; attempt++) assert.equal((await ingest.POST(req("/api/watch/ingest", capture, bearer))).status, 200)
    assert.equal(await prisma.watchCue.count(), 1)
    assert.equal((await ingest.POST(req("/api/watch/ingest", { ...capture, sequence: 0, positionMs: 0 }, bearer))).status, 200)
    assert.equal((await prisma.watchSession.findFirstOrThrow()).positionMs, 2000)
    assert.equal((await ingest.POST(req("/api/watch/ingest", { ...capture, sequence: 2, positionMs: 1500, cues: [{ ...capture.cues[0], revision: 1, text: "Hello there!" }] }, bearer))).status, 200)
    assert.equal(await prisma.watchCue.count(), 1)
    assert.equal((await prisma.watchCue.findFirstOrThrow()).text, "Hello there!")
    assert.equal((await ingest.POST(req("/api/watch/ingest", { ...capture, cues: [{ ...capture.cues[0], endMs: 0 }] }, bearer))).status, 400)
    assert.equal((await ingest.POST(req("/api/watch/ingest", { ...capture, media: { ...capture.media, sourceId: "another-video" } }, bearer))).status, 409)
    const own = await (await overview.GET(req("/api/watch", undefined, { cookie }, "GET"))).json()
    assert.equal(own.captures.length, 1)
    assert.equal(JSON.stringify(own).includes(hash), false)
    const other = await (await overview.GET(req("/api/watch", undefined, { cookie: otherCookie }, "GET"))).json()
    assert.equal(other.captures.length, 0)
    assert.equal(other.devices.length, 0)
    await overview.DELETE(req("/api/watch", { deviceId: device.id }, { cookie: otherCookie, origin: appOrigin }, "DELETE"))
    assert.equal((await ingest.POST(req("/api/watch/ingest", capture, bearer))).status, 200)
    await overview.DELETE(req("/api/watch", { deviceId: device.id }, { cookie, origin: appOrigin }, "DELETE"))
    assert.equal((await ingest.POST(req("/api/watch/ingest", capture, bearer))).status, 401)
    await prisma.watchPairing.updateMany({ data: { expiresAt: new Date(0) } })
    assert.equal((await pair.POST(req("/api/watch/pair", { action: "status", deviceCode: pairing.deviceCode }))).status, 410)
  } finally {
    await prisma.$disconnect()
    // This directory was created by this test and is always directly beneath tmpdir.
    assert.equal(dirname(directory), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})
