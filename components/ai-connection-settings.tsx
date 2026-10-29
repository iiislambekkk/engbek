"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Settings = {
  connection: string
  openaiApiKeyAvailable: boolean
  chatgptEmail: string | null
  chatgptEnabled: boolean
  chatgptAvailable: boolean
}

export function AiConnectionSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/settings/ai").then((res) => res.json()).then(setSettings).catch(() => setError("Could not load settings."))
  }, [])

  async function change(data: { connection?: string }) {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/settings/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not save settings.")
      setSettings(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save settings.")
    } finally {
      setBusy(false)
    }
  }

  async function connectChatGPT() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/auth/chatgpt/start", { method: "POST" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not start ChatGPT sign-in.")
      window.location.assign(result.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start ChatGPT sign-in.")
      setBusy(false)
    }
  }

  async function disconnectChatGPT() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/settings/ai?type=chatgpt", { method: "DELETE" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not disconnect ChatGPT.")
      setSettings(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect ChatGPT.")
    } finally {
      setBusy(false)
    }
  }

  const urlError = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("error")

  return <section className="mx-auto max-w-2xl space-y-5 pb-24 sm:space-y-6 lg:pb-0">
    <header>
      <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">← Site settings</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">AI connection</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground sm:text-base">Choose the AI connection used by Watch.</p>
    </header>
    {(error || urlError) && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error || "ChatGPT connection was not completed. Please try again."}</p>}
    {!settings ? <Spinner /> : <>
      <Card>
        <CardHeader>
          <CardTitle>GPT connection</CardTitle>
          <CardDescription>Select the credential used for Watch translations and vocabulary explanations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button type="button" disabled={busy || !settings.openaiApiKeyAvailable} onClick={() => change({ connection: "openai_api_key" })} className={`w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${settings.connection === "openai_api_key" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
            <span className="font-medium">Server OPENAI_API_KEY</span>
            <span className="mt-1 block text-sm text-muted-foreground">Use the key configured in the server environment. Your key is never entered or stored in your account.</span>
            <span className="mt-2 block text-xs text-muted-foreground">{settings.openaiApiKeyAvailable ? (settings.connection === "openai_api_key" ? "Selected" : "Available") : "OPENAI_API_KEY is not configured on the server"}</span>
          </button>

          <div className={`rounded-xl border p-4 ${settings.connection === "chatgpt" ? "border-primary bg-primary/5" : ""}`}>
            <button type="button" disabled={busy || !settings.chatgptEnabled} onClick={() => change({ connection: "chatgpt" })} className="w-full text-left disabled:cursor-not-allowed disabled:opacity-60">
              <span className="font-medium">Sign in with ChatGPT</span>
              <span className="mt-1 block text-sm text-muted-foreground">Use your eligible ChatGPT plan through the local sign-in flow.</span>
              <span className="mt-2 block text-xs text-muted-foreground">{settings.chatgptEmail ? `${settings.chatgptEmail}${settings.connection === "chatgpt" ? " · selected" : " · connected"}` : "Not connected"}</span>
            </button>
            {!settings.chatgptAvailable && <p className="mt-3 text-sm text-muted-foreground">ChatGPT sign-in requires opening this app on the computer running it, at localhost.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {!settings.chatgptEnabled && <Button variant="outline" disabled={busy || !settings.chatgptAvailable} onClick={connectChatGPT}>Connect ChatGPT</Button>}
              {settings.chatgptEmail && <Button variant="ghost" disabled={busy} onClick={disconnectChatGPT}>Disconnect</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

    </>}
  </section>
}
