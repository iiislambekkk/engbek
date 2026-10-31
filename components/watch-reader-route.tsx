"use client"

import { useEffect, useState } from "react"
import { WatchReader } from "@/components/watch-reader"

export function WatchReaderRoute({ mediaId }: { mediaId: string }) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let handshake: ReturnType<typeof setTimeout> | undefined

    function retry(current: WebSocket) {
      if (stopped || socket !== current) return
      if (handshake) clearTimeout(handshake)
      setConnected(false)
      socket = null
      if (timer) clearTimeout(timer)
      timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++))
    }
    function connect() {
      if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
      if (timer) clearTimeout(timer)
      const current = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/watch/socket`)
      socket = current
      handshake = setTimeout(() => { if (socket === current && current.readyState !== WebSocket.OPEN) { current.close(); retry(current) } }, 8000)
      current.onopen = () => {
        if (socket !== current) return
        if (handshake) clearTimeout(handshake)
        attempt = 0
        setConnected(true)
        window.dispatchEvent(new CustomEvent("lexi-watch-changed"))
      }
      current.onmessage = message => {
        try {
          const payload = JSON.parse(String(message.data)) as { type: string }
          if (payload.type !== "ready") window.dispatchEvent(new CustomEvent("lexi-watch-changed"))
        } catch { window.dispatchEvent(new CustomEvent("lexi-watch-changed")) }
      }
      current.onerror = () => { current.close(); retry(current) }
      current.onclose = () => retry(current)
    }
    function wake() {
      if (document.visibilityState === "visible") {
        window.dispatchEvent(new CustomEvent("lexi-watch-changed"))
        connect()
      }
    }
    connect()
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible" && socket?.readyState !== WebSocket.OPEN) window.dispatchEvent(new CustomEvent("lexi-watch-changed"))
    }, 5000)
    const reconcile = setInterval(() => {
      if (document.visibilityState === "visible") window.dispatchEvent(new CustomEvent("lexi-watch-changed"))
    }, 15_000)
    window.addEventListener("online", wake)
    document.addEventListener("visibilitychange", wake)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      if (handshake) clearTimeout(handshake)
      clearInterval(fallback)
      clearInterval(reconcile)
      socket?.close()
      window.removeEventListener("online", wake)
      document.removeEventListener("visibilitychange", wake)
    }
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("watch-subtitle-reader", { detail: true }))
    return () => { window.dispatchEvent(new CustomEvent("watch-subtitle-reader", { detail: false })) }
  }, [])

  return <WatchReader mediaId={mediaId} connected={connected} onBack={() => window.location.assign("/watch")} />
}
