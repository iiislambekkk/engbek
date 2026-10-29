"use client"

import { useState } from "react"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export function ConnectBrowser({ initialCode }: { initialCode: string }) {
  const { data: session, isPending } = authClient.useSession()
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState("")

  async function approve() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/watch/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve", code: code.replace(/[^A-F0-9]/gi, "").toUpperCase() }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setApproved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect browser.") }
    finally { setBusy(false) }
  }

  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
    <section className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 sm:p-8">
      <p className="text-sm font-medium text-primary">Lexi Watch</p>
      <h1 className="text-2xl font-semibold">{approved ? "Browser connected" : "Connect your browser"}</h1>
      {approved ? <>
        <p className="text-sm leading-6 text-muted-foreground">Return to Stremio or YouTube. Subtitles will start sending automatically. Open Watch on your phone with the same Lexi account.</p>
        <Link href="/watch" className="inline-block font-medium text-primary underline">Open Watch</Link>
      </> : <>
        <p className="text-sm leading-6 text-muted-foreground">Match this code with the one shown beside the Lexi button in your video tab. Connecting allows that browser to send video details and subtitles to your account.</p>
        <label className="block space-y-2 text-sm font-medium">
          <span>Connection code</span>
          <input value={code} onChange={event => setCode(event.target.value)} maxLength={11} autoComplete="off" className="w-full rounded-lg border bg-background p-3 text-center font-mono text-xl uppercase tracking-widest" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {isPending ? <p className="text-sm">Checking your account…</p> : session ? <>
          <p className="break-all text-sm text-muted-foreground">Connect to {session.user.email}</p>
          <Button className="w-full" disabled={busy || !/^[A-F0-9]{10}$/i.test(code.replace(/-/g, ""))} onClick={approve}>{busy ? "Connecting…" : "Connect browser"}</Button>
        </> : <Link href={`/login?next=${encodeURIComponent(`/connect-browser?code=${encodeURIComponent(code)}`)}`} className="block rounded-full bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">Sign in to Lexi</Link>}
      </>}
    </section>
  </main>
}
