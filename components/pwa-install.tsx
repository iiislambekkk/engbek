"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

export function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && navigator.standalone === true)
    setInstalled(standalone)
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window))
    const onPrompt = (event: Event) => {
      event.preventDefault()
      const installEvent = event as InstallPromptEvent
      ;(window as Window & { __pwaInstallPrompt?: InstallPromptEvent }).__pwaInstallPrompt = installEvent
      setPromptEvent(installEvent)
    }
    const onInstalled = () => { setInstalled(true); setPromptEvent(null) }
    // The browser may dispatch this before React hydrates, so check whether
    // installation is available after hydration as well.
    const checkInstallability = () => {
      const event = (window as Window & { __pwaInstallPrompt?: InstallPromptEvent }).__pwaInstallPrompt
      if (event) setPromptEvent(event)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    checkInstallability()
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed || (!promptEvent && !ios)) return null

  if (ios) return <p className="text-xs text-muted-foreground">Чтобы установить Engbek: откройте сайт в Safari, нажмите «Поделиться» → «На экран Домой» → «Добавить».</p>

  if (!promptEvent) return <p className="text-xs text-muted-foreground">Чтобы установить Engbek, откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».</p>

  return <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent" onClick={async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === "accepted") {
      setPromptEvent(null)
      delete (window as Window & { __pwaInstallPrompt?: InstallPromptEvent }).__pwaInstallPrompt
    }
  }}><Download className="size-4" />Установить приложение</button>
}
