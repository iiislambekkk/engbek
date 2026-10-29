"use client"

import { useEffect, useState } from "react"

const presets = ["#a78bfa", "#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#f97316"]

export function WatchHighlightSettings() {
  const [color, setColor] = useState("#a78bfa")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/settings/ai", { cache: "no-store", signal: controller.signal }).then(response => response.ok ? response.json() : null).then(value => { if (value?.watchHighlightColor) setColor(value.watchHighlightColor) }).catch(() => {})
    return () => controller.abort()
  }, [])

  async function save(next: string) {
    setColor(next); setSaved(false); setError("")
    try {
      const response = await fetch("/api/settings/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ watchHighlightColor: next }) })
      if (!response.ok) throw new Error("Could not save the highlight color.")
      setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the highlight color.") }
  }

  return <section className="max-w-xl rounded-2xl border bg-card p-5"><div><h2 className="font-medium">Watch highlight color</h2><p className="mt-1 text-sm text-muted-foreground">Choose the color for words and phrases you mark while watching.</p></div><div className="mt-4 flex flex-wrap items-center gap-3">{presets.map(preset => <button key={preset} aria-label={`Use ${preset}`} aria-pressed={color.toLowerCase() === preset} onClick={() => void save(preset)} className={`size-8 rounded-full border-2 ${color.toLowerCase() === preset ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: preset }} />)}<label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"><input aria-label="Custom highlight color" type="color" value={color} onChange={event => void save(event.target.value)} className="size-6 cursor-pointer border-0 bg-transparent p-0" />Custom</label><span aria-live="polite" className="text-xs text-muted-foreground">{error || (saved ? "Saved" : "")}</span></div><p className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ color, backgroundColor: `${color}20` }}>Marked word preview</p></section>
}
