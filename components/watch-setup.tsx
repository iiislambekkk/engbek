"use client"

import { useEffect, useState } from "react"
import { MonitorPlay, Radio, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type Device = { id: string; name: string; lastSeenAt: string | null; expiresAt: string }
type Capture = {
  id: string; title: string; source: string; url: string; thumbnail: string | null
  positionMs: number; durationMs: number | null; state: string; updatedAt: string
  _count: { cues: number }
  cues: { id: string; text: string; startMs: number; approximate: boolean }[]
}
type Overview = { devices: Device[]; captures: Capture[] }
const timestamp = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`

export function WatchSetup() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState("")
  const [origin, setOrigin] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [observedAt, setObservedAt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function load() {
      setOrigin(window.location.origin)
      try {
        const response = await fetch("/api/watch", { cache: "no-store", signal: controller.signal })
        if (!response.ok) throw new Error("Could not load browser connections.")
        const result = await response.json() as Overview
        if (!cancelled) { setData(result); setError(""); setObservedAt(Date.now()) }
      } catch (cause) {
        if (!cancelled) { setError(cause instanceof Error ? cause.message : "Connection failed."); setObservedAt(Date.now()) }
      } finally {
        if (!cancelled) timer = setTimeout(load, 3000)
      }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [])

  async function revoke(id: string) {
    setBusy(id)
    try {
      const response = await fetch("/api/watch", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: id }) })
      if (!response.ok) throw new Error("Could not disconnect browser.")
      setData(current => current ? { ...current, devices: current.devices.filter(device => device.id !== id) } : current)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect.") }
    finally { setBusy(null) }
  }

  return <section className="mx-auto max-w-3xl space-y-6 pb-24 lg:pb-0">
    <header>
      <p className="text-sm font-medium text-primary">Learn as you watch</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Watch</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Send subtitles from Stremio or YouTube to your Lexi account.</p>
    </header>
    <div className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold"><Link2 className="size-5 text-primary" /> Connect your video browser</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
        <li>Install Tampermonkey on the computer where you watch videos, then <a className="font-medium text-primary underline" href={origin ? `https://www.tampermonkey.net/script_installation.php#url=${origin}/lexi-watch.user.js` : "/lexi-watch.user.js"} target="_blank" rel="noopener noreferrer">send the Lexi Watch script to Tampermonkey</a> and confirm installation there.</li>
        <li>Open Stremio Web or YouTube, play a video, and enable a subtitle track. Click <strong>Send subtitles to Lexi</strong>.</li>
        <li>Use <code className="break-all rounded bg-muted px-1 text-foreground">{origin || "this site's address"}</code> as your Lexi address. Sign in and confirm the matching connection code.</li>
      </ol>
      <p className="text-xs leading-5 text-muted-foreground">The script hides captions on the computer while connected. Stopping the script or losing the connection restores them. Disable your old subtitle pop-out script while using Lexi Watch.</p>
    </div>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>}
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold"><Radio className="size-4" /> Received from your browser</h2>
      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : !data.captures.length ? <div className="rounded-2xl border border-dashed p-8 text-center"><MonitorPlay className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Start sending a video to see its details and received subtitles here.</p></div> : data.captures.map(capture => <article key={capture.id} className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex min-w-0 gap-4 p-5">
          {/* Metadata images are optional, external, and can change with the source. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {capture.thumbnail && <img src={capture.thumbnail} alt="" referrerPolicy="no-referrer" className="hidden h-16 w-24 shrink-0 rounded-lg object-cover sm:block" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs capitalize text-muted-foreground">{capture.source} · {observedAt - Date.parse(capture.updatedAt) > 15_000 ? "Offline" : capture.state}</p>
            <h3 className="mt-1 break-words font-medium">{capture.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{timestamp(capture.positionMs)}{capture.durationMs ? ` / ${timestamp(capture.durationMs)}` : ""} · {capture._count.cues} saved captions</p>
          </div>
        </div>
        {!!capture.cues.length && <div className="space-y-3 border-t bg-muted/20 p-5">{[...capture.cues].reverse().map(cue => <p key={cue.id} className="text-sm leading-6"><span className="mr-3 font-mono text-xs text-muted-foreground">{cue.approximate ? "~" : ""}{timestamp(cue.startMs)}</span><span className="whitespace-pre-line break-words">{cue.text}</span></p>)}</div>}
      </article>)}
    </section>
    <section className="space-y-3">
      <h2 className="font-semibold">Connected browsers</h2>
      {data?.devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{device.name}</p><p className="mt-1 text-xs text-muted-foreground">{Date.parse(device.expiresAt) <= observedAt ? "Connection expired" : device.lastSeenAt ? `Last active ${new Date(device.lastSeenAt).toLocaleString()}` : "Waiting for the first video"}</p></div>
        <Button variant="outline" size="sm" disabled={busy === device.id} onClick={() => revoke(device.id)}>Disconnect</Button>
      </div>)}
      {data && !data.devices.length && <p className="text-sm text-muted-foreground">No browsers connected yet.</p>}
    </section>
  </section>
}
