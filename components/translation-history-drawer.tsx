"use client"

import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowDown, LoaderCircle, Volume2 } from "lucide-react"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

type ChatMessage = { role: "user" | "assistant"; content: string }
type Explanation = { wordTranslation?: string; contextMeaning?: string; contextTranslation?: string; usage?: string; notes?: string; otherMeanings?: { meaning: string; translation: string; example: string; exampleTranslation: string }[] }
export type TranslationHistoryEntry = { id: string; text: string; context: string; explanation: unknown; chat: unknown; sourceType: string; sourceTitle: string; locationLabel: string | null; locationValue: number | null }

export function TranslationHistoryDrawer({ entry, onOpenChange, loading = false, requestError = "", overlayClassName, viewportClassName, contentClassName }: { entry: TranslationHistoryEntry | null; onOpenChange: (open: boolean) => void; loading?: boolean; requestError?: string; overlayClassName?: string; viewportClassName?: string; contentClassName?: string }) {
  const [chat, setChat] = useState<ChatMessage[]>(() => Array.isArray(entry?.chat) ? entry.chat as ChatMessage[] : [])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const explanation = (entry?.explanation || {}) as Explanation

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }) }, [chat, busy])

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text || !entry || busy) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/learning-history/translations/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.id, message: text }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not send your message.")
      setChat(result.chat)
      setMessage("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send your message.") }
    finally { setBusy(false) }
  }

  function speak() {
    if (!("speechSynthesis" in window) || !entry) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(entry.context)
    utterance.lang = "en-US"
    window.speechSynthesis.speak(utterance)
  }

  return <Drawer open={!!entry} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle overlayClassName={overlayClassName} viewportClassName={viewportClassName}>
    <DrawerContent className={`[--drawer-inset:0px] inset-x-0 bottom-0 m-0 flex h-[min(88dvh,54rem)] max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl rounded-b-none border-0 bg-background shadow-2xl ${contentClassName ?? ""}`}>
      <DrawerHeader className="shrink-0 border-b bg-background px-5 pb-4 pt-5 text-left sm:px-7">
        <DrawerTitle className="text-lg">Translation and usage</DrawerTitle>
        <DrawerDescription className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-muted/60 px-3 py-2.5 text-sm font-medium leading-6 text-foreground">{entry?.text}</DrawerDescription>
      </DrawerHeader>
      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
        {loading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Generating explanation...</div>}
        {requestError && <p role="alert" className="text-sm text-destructive">{requestError}</p>}
        {entry && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Word in context · {entry.sourceTitle}</h3><p className="mt-1 whitespace-pre-line text-sm leading-6">{entry.context}</p><button type="button" onClick={speak} className="mt-2 inline-flex items-center gap-2 rounded-full bg-background px-3 py-2 text-xs font-medium hover:bg-background/80"><Volume2 className="size-4" />Listen to phrase</button></section>}
        {explanation.contextMeaning && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meaning in this context</h3><p className="mt-1 text-sm leading-6">{explanation.contextMeaning}</p>{explanation.wordTranslation && <><h3 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Russian translation</h3><p className="mt-1 text-lg font-medium">{explanation.wordTranslation}</p></>}</section>}
        {explanation.contextTranslation && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full line in Russian</h3><p className="mt-1 text-base leading-7">{explanation.contextTranslation}</p></section>}
        {explanation.usage && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How to use it</h3><p className="mt-1 text-sm leading-6">{explanation.usage}</p></section>}
        {!!explanation.otherMeanings?.length && <section><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other common meanings</h3><div className="mt-2 space-y-3">{explanation.otherMeanings.map((item, index) => <article key={`${item.meaning}-${index}`} className="rounded-xl bg-muted/70 p-3"><p className="font-medium">{item.meaning}</p><p className="mt-1 text-sm">{item.translation}</p><blockquote className="mt-3 border-l-2 pl-3 text-sm italic">{item.example}</blockquote><p className="mt-1 pl-3 text-sm text-muted-foreground">{item.exampleTranslation}</p></article>)}</div></section>}
        {explanation.notes && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Usage notes</h3><p className="mt-1 text-sm leading-6">{explanation.notes}</p></section>}
        {chat.length > 0 && <section className="space-y-5 border-t pt-5">{chat.map((item, index) => <article key={`${index}-${item.role}`} className={item.role === "user" ? "ml-auto w-fit min-w-0 max-w-[min(82%,36rem)] rounded-3xl bg-sky-100 px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm dark:bg-sky-950/70 dark:text-sky-50" : "w-full py-1 text-sm leading-6 text-foreground"}><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown></article>)}</section>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <form onSubmit={event => void send(event)} className="shrink-0 border-t bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-7"><div className="flex items-end gap-1.5 rounded-3xl border bg-muted/40 p-1.5 focus-within:ring-2 focus-within:ring-primary/20"><textarea rows={1} value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} disabled={!entry || busy} placeholder="Ask a follow-up question…" className="max-h-32 min-h-7 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-50" /><button type="submit" disabled={!entry || busy || !message.trim()} aria-label="Send message" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40">{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDown className="size-3.5 -rotate-90" />}</button></div></form>
    </DrawerContent>
  </Drawer>
}
