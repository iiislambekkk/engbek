import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { webcrypto } from "node:crypto"
import { runInNewContext } from "node:vm"
import { setImmediate as settle } from "node:timers/promises"

const script = readFileSync(new URL("../public/lexi-watch.user.js", import.meta.url), "utf8")

// DOM fixtures exercise both adapters and the real userscript lifecycle. They
// deliberately include Stremio's unclassed HTML-subtitle renderer.
async function browser(source, native = false) {
  const intervals = new Map(), storage = new Map(), packets = [], events = new Map()
  let clock = Date.now(), httpStatus = 200
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.textContent = ""; this.isConnected = true; this.listeners = {}
      this.style = {
        getPropertyValue(key) { return this[key] || "" },
        getPropertyPriority() { return "" },
        setProperty(key, value) { this[key] = value },
        removeProperty(key) { delete this[key] },
      }
    }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child) } }
    appendChild(child) { this.append(child) }
    setAttribute(key, value) { this[key] = value }
    addEventListener(name, callback) { this.listeners[name] = callback }
    contains(other) { return this.children.includes(other) }
    closest() { return null }
    remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.isConnected = false }
  }
  const body = new Element("body"), head = new Element("head"), player = new Element("div"), layer = new Element("div"), line = new Element("span"), video = new Element("video")
  body.append(player); player.append(video, layer); layer.append(line)
  Object.assign(layer.style, { position: "absolute", textAlign: "center" })
  Object.assign(line.style, { display: "inline-block", whiteSpace: "pre-wrap", opacity: "0.8" })
  line.textContent = "Hello"
  Object.assign(video, { currentTime: 1, duration: 120, readyState: 4, seeking: false, ended: false, paused: false, offsetWidth: 1280, offsetHeight: 720, textTracks: native ? [{ mode: "showing", kind: "subtitles", id: "en", language: "en", label: "English", activeCues: [{ id: "cue-1", startTime: 1, endTime: 3, getCueAsHTML: () => ({ textContent: "Hello" }) }] }] : [] })
  const location = new URL(source === "youtube" ? "https://www.youtube.com/watch?v=abc123" : "https://web.stremio.com/#/player/tt1234567:1:2")
  const findId = (root, id) => root.id === id ? root : root.children.map(child => findId(child, id)).find(Boolean)
  const document = {
    body, head, title: "Fixture movie - Stremio",
    createElement: tag => new Element(tag),
    getElementById: id => id === "movie_player" ? { classList: { contains: () => false }, getVideoData: () => ({ video_id: "abc123", title: "Fixture YouTube video" }), getOption: () => ({ languageCode: "en", id: "en" }) } : findId(body, id) || findId(head, id),
    querySelector: () => null,
    querySelectorAll: selector => selector === "video" ? [video] : source === "youtube" && selector.includes("caption-visual-line") ? [line] : [],
  }
  storage.set("origin", "http://192.168.8.63:3000")
  storage.set("connection", { origin: "http://192.168.8.63:3000", token: "lexi_watch_" + "a".repeat(64) })
  class Clock extends Date { static now() { return clock } }
  const context = {
    document, location, navigator: { platform: "test" }, unsafeWindow: { document }, Date: Clock,
    crypto: webcrypto, TextEncoder, URL, Map, Set, console, setTimeout,
    window: { addEventListener: (name, callback) => events.set(name, callback) },
    setInterval: (callback, ms) => intervals.set(ms, callback),
    GM_getTab: callback => callback({ lexiId: source + (native ? "-native" : "-dom") }), GM_saveTab() {},
    GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
    GM_setValue: (key, value) => storage.set(key, structuredClone(value)),
    GM_deleteValue: key => storage.delete(key), GM_registerMenuCommand() {},
    GM_openInTab() { throw new Error("Existing token should skip pairing") },
    GM_xmlhttpRequest(options) {
      assert.equal(options.anonymous, true)
      assert.match(options.headers.Authorization, /^Bearer lexi_watch_/)
      assert.match(options.url, /\/api\/watch\/ingest$/)
      packets.push(JSON.parse(options.data))
      queueMicrotask(() => options.onload({ status: httpStatus, responseText: JSON.stringify(httpStatus === 200 ? { ok: true } : { error: "Test disconnect" }) }))
    },
    alert(message) { throw new Error(message) }, prompt() { throw new Error("Server address should already be saved") },
  }
  await runInNewContext(script, context)
  const button = document.getElementById("lexi-watch-controls").children[0]
  const drain = async () => { for (let i = 0; i < 8; i++) await settle() }
  return {
    packets, video, line, document, storage,
    click: async () => { await button.listeners.click(); await drain() },
    tick: async () => { intervals.get(250)(); await drain() },
    pump: async () => { intervals.get(2000)(); await drain() },
    network: status => { httpStatus = status; clock += 60_000 },
  }
}

for (const source of ["stremio", "youtube"]) {
  test(`${source}: DOM captions, rolling revisions, hide/restore and stored token`, async () => {
    const b = await browser(source)
    await b.click()
    assert.equal(b.packets[0].media.source, source)
    assert.equal(b.packets[0].cues[0].text, "Hello")
    assert.equal(b.packets[0].cues[0].approximate, true)
    if (source === "stremio") { assert.equal(b.packets[0].media.imdbId, "tt1234567"); assert.equal(b.packets[0].media.episode, 2) }
    await b.tick()
    assert.equal(b.line.style.opacity, "0")
    b.line.textContent = "Hello there"; b.video.currentTime = 1.3
    await b.tick(); await b.pump()
    const updated = b.packets.at(-1).cues[0]
    assert.equal(updated.cueKey, b.packets[0].cues[0].cueKey)
    assert.equal(updated.text, "Hello there")
    assert.ok(updated.revision > b.packets[0].cues[0].revision)
    await b.click()
    assert.equal(b.line.style.opacity, "0.8")
    assert.equal(b.document.getElementById("lexi-watch-hidden-cues"), undefined)
  })

  test(`${source}: native timing and replay do not resend the same cue`, async () => {
    const b = await browser(source, true)
    await b.click()
    assert.equal(b.packets[0].cues[0].startMs, 1000)
    assert.equal(b.packets[0].cues[0].endMs, 3000)
    assert.equal(b.packets[0].cues[0].approximate, false)
    b.video.currentTime = 1.5
    await b.tick(); await b.pump()
    b.video.seeking = true; await b.tick()
    b.video.currentTime = 1; b.video.seeking = false
    await b.tick(); await b.pump()
    assert.equal(b.packets.flatMap(packet => packet.cues).length, 1)
    await b.click()
  })
}

test("network outage restores captions, keeps outbox, and retries the identical packet", async () => {
  const b = await browser("youtube")
  await b.click(); await b.tick()
  b.network(503)
  b.video.currentTime = 1.2; await b.tick(); await b.pump()
  const failed = b.packets.at(-1)
  await b.tick()
  assert.equal(b.line.style.opacity, "0.8")
  const saved = b.storage.get("capture:youtube-dom")
  assert.ok(saved.outbox.length)
  b.network(200); await b.pump()
  assert.deepEqual(b.packets.at(-1), failed)
  await b.click()
})
