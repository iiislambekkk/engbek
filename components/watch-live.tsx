"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import {
  ArrowLeft,
  ArrowDown,
  Bookmark,
  Captions,
  Check,
  ChevronRight,
  History,
  Link2,
  ListVideo,
  MonitorPlay,
  Radio,
  Search,
  WifiOff,
  Play,
  Pause,
  LoaderCircle,
  Languages,
  Volume2,
  X,
  LayoutGrid,
  List,
  Rewind,
  FastForward,
  Settings,
  Ear,
  ChevronDown
} from "lucide-react"
import { watchVocabularySourceId } from "@/lib/vocabulary/types"
import { VocabularyAddDialog } from "@/components/vocabulary-add-dialog"
import { SelectionMenu } from "@/components/selection-menu"
type Playback = { id?: string; positionMs: number; durationMs?: number | null; state: string; updatedAt: string; capturedAt: string | null; playbackRate?: number; activeKeys?: string }
type Media = { id: string; title: string; source: string; thumbnail: string | null; durationMs: number | null; updatedAt: string; mediaType?: "movie" | "series"; year?: string | null; overview?: string | null; episodeTitle?: string | null; episodeOverview?: string | null; episodeThumbnail?: string | null; poster?: string | null; backdrop?: string | null; season?: number | null; episode?: number | null; sessions?: Playback[] }
type Track = { id: string; key: string; language: string | null; _count: { lines: number } }
type Line = { id: string; trackId?: string; text: string; startMs: number; endMs: number; approximate: boolean; bookmarked: boolean; updatedAt?: string }
type Library = { media: Media[]; hasMore: boolean; serverTime: string; page: number }
type Transcript = { media: Media & { tracks: Track[] }; session: Playback | null; trackId: string | null; lines: Line[]; bookmarkedLineCount?: number; activeLineIds: string[]; serverTime: string; next: string | null; receivedAt: number }
type Capture = { type: "capture"; mediaId: string; trackId: string | null; lines: Line[]; session: Playback; activeLineIds: string[]; serverTime: string }
type SavedExpression = { id: string; text: string; context: string; startMs: number; endMs: number; lineId: string; inVocabulary: boolean }
type ExpressionExplanation = { wordTranslation: string; contextMeaning: string; contextTranslation: string; usage: string; otherMeanings: { meaning: string; translation: string; example: string; exampleTranslation: string }[]; notes: string }
type TranslationHistoryItem = { id: string; lineId: string; text: string; context: string; explanation: ExpressionExplanation; chat: TranslationChatMessage[]; updatedAt: string; line: { text: string; startMs: number; endMs: number } }
type TranslationChatMessage = { role: "user" | "assistant"; content: string }
const time = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
const changed = (detail?: Capture) => window.dispatchEvent(new CustomEvent("lexi-watch-changed", { detail }))

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal })
  if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again." : "Could not load Watch. Reconnecting…")
  return response.json() as Promise<T>
}

// Serialize refreshes so a burst of playback events cannot cancel a large initial transcript.
function useResource<T>(loader: (signal: AbortSignal) => Promise<T>, applyRealtime?: (current: T, event: Capture) => T | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState("")
  const dataRef = useRef<T | null>(null)
  const applyRef = useRef(applyRealtime)
  useEffect(() => { applyRef.current = applyRealtime }, [applyRealtime])
  useEffect(() => {
    const controller = new AbortController()
    let loading = false, queued = false
    async function refresh() {
      if (loading) { queued = true; return }
      loading = true
      do {
        queued = false
        try {
          const result = await loader(controller.signal)
          if (!controller.signal.aborted) { dataRef.current = result; setData(result); setError("") }
        } catch (cause) {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Connection lost.")
        }
      } while (queued && !controller.signal.aborted)
      loading = false
    }
    void refresh()
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<Capture | undefined>).detail
      if (detail?.type === "capture" && applyRef.current && dataRef.current) {
        const next = applyRef.current(dataRef.current, detail)
        if (next) { dataRef.current = next; setData(next); setError(""); return }
      }
      void refresh()
    }
    window.addEventListener("lexi-watch-changed", onChanged)
    return () => { controller.abort(); window.removeEventListener("lexi-watch-changed", onChanged) }
  }, [loader])
  return { data, error }
}

function useConnection() {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    let socket: WebSocket | null = null, stopped = false, attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let handshake: ReturnType<typeof setTimeout> | undefined
    function retry(current: WebSocket) {
      if (stopped || socket !== current) return
      if (handshake) clearTimeout(handshake)
      setConnected(false); socket = null
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
        attempt = 0; setConnected(true); changed()
      }
      current.onmessage = message => {
        try {
          const payload = JSON.parse(String(message.data)) as Capture | { type: string }
          if (payload.type === "capture") changed(payload as Capture)
          else if (payload.type !== "ready") changed()
        } catch { changed() }
      }
      current.onerror = () => { current.close(); retry(current) }
      current.onclose = () => retry(current)
    }
    function wake() {
      if (document.visibilityState === "visible") { changed(); connect() }
    }
    connect()
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible" && socket?.readyState !== WebSocket.OPEN) changed()
    }, 5000)
    // Reconcile even if an invalidation was lost while a phone was suspended.
    const reconcile = setInterval(() => { if (document.visibilityState === "visible") changed() }, 15_000)
    window.addEventListener("online", wake)
    document.addEventListener("visibilitychange", wake)
    return () => {
      stopped = true; if (timer) clearTimeout(timer); if (handshake) clearTimeout(handshake); clearInterval(fallback); clearInterval(reconcile); socket?.close()
      window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake)
    }
  }, [])
  return connected
}

function Cover({ media, large = false, poster = false, fluidPoster = false }: { media: Media; large?: boolean; poster?: boolean; fluidPoster?: boolean }) {
  const isStremioListPoster = !large && !poster && media.source.toLowerCase() === "stremio"
  const isStremioPoster = media.source.toLowerCase() === "stremio"
  const posterStyle = poster ? { width: fluidPoster ? "100%" : "8rem", aspectRatio: isStremioPoster ? "2 / 3" : "16 / 9", height: "auto" } : undefined
  return <div style={posterStyle} className={`${poster ? `block min-w-0 rounded-none ${fluidPoster ? "" : "shrink-0"}` : large ? "size-14 sm:size-20" : `w-28 sm:w-32 ${isStremioListPoster ? "h-40" : "aspect-video"}`} relative ${poster ? "" : "shrink-0"} overflow-hidden rounded-md bg-primary/10 text-primary`}>
    <MonitorPlay className="absolute inset-0 m-auto size-6" />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {media.thumbnail && <img src={media.thumbnail} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.style.display = "none" }} />}
  </div>
}




export function WatchLive() {
  const connected = useConnection()
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const [page, setPage] = useState(0)
  const mediaItemsRef = useRef<Media[]>([])
  const loadingNextPage = useRef(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list"
    const savedView = window.localStorage.getItem("watch-library-view")
    return savedView === "grid" ? "grid" : "list"
  })
  const [sourceTab, setSourceTab] = useState<"youtube" | "stremio">("stremio")
  const loader = useCallback(async (signal: AbortSignal) => {
    const result = await read<Omit<Library, "page">>(`/api/watch/library?page=${page}`, signal)
    const byId = new Map(mediaItemsRef.current.map(media => [media.id, media]))
    for (const media of result.media) byId.set(media.id, media)
    mediaItemsRef.current = [...byId.values()]
    loadingNextPage.current = false
    return { ...result, media: mediaItemsRef.current, page }
  }, [page])
  const { data, error } = useResource(loader)
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || !data || data.page !== page || !data.hasMore || loadingNextPage.current) return
      loadingNextPage.current = true
      setPage(current => current + 1)
    }, { rootMargin: "500px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [data, page])
  function changeView(nextView: "list" | "grid") {
    setView(nextView)
    window.localStorage.setItem("watch-library-view", nextView)
  }
  const active = data?.media.find(media => {
    const session = media.sessions?.[0]
    return session && !["ended", "stopped"].includes(session.state) && Date.parse(data.serverTime) - Date.parse(session.capturedAt || session.updatedAt) < 15_000
  })
  const mediaId = selected || (!history ? active?.id : null)
  if (mediaId) return <WatchReader key={mediaId} mediaId={mediaId} connected={connected} onBack={() => { setSelected(null); setHistory(true) }} />

  const visible = data?.media.filter(media => `${media.title} ${media.episodeTitle || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const youtubeMedia = visible?.filter(media => media.source.toLowerCase() !== "stremio")
  const stremioMedia = visible?.filter(media => media.source.toLowerCase() === "stremio")
  const renderMediaCard = (media: Media) => <button key={media.id} onClick={() => setSelected(media.id)} className={view === "grid" ? "group grid w-full min-w-0 grid-rows-[auto_1fr] content-start overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/30" : "group flex w-full items-center gap-4 py-5 text-left"}>
    <Cover media={media} poster={view === "grid"} fluidPoster={view === "grid"} /><div className={view === "grid" ? `min-w-0 ${media.source.toLowerCase() === "stremio" ? "p-2 sm:p-2.5" : "p-3"}` : "min-w-0 flex-1"}><p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{media.mediaType === "series" ? "TV Series" : media.mediaType === "movie" ? "Movie" : media.source}{media.year ? ` · ${media.year}` : ""}</p>{view === "grid" ? <h3 className="mt-1 flex min-w-0 items-baseline gap-1.5 text-sm font-semibold leading-6 group-hover:text-primary sm:text-base"><span className="min-w-0 flex-1 truncate">{media.title}</span>{media.mediaType === "series" && media.season !== null && media.season !== undefined && <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-muted-foreground">S{String(media.season).padStart(2, "0")}{media.episode !== null && media.episode !== undefined ? ` · E${String(media.episode).padStart(2, "0")}` : ""}</span>}</h3> : <><h3 className="mt-1 line-clamp-2 min-h-12 text-sm font-semibold leading-6 group-hover:text-primary sm:text-base">{media.title}</h3>{media.mediaType === "series" && (media.episodeTitle || media.season !== null && media.season !== undefined) && <p className="mt-0.5 line-clamp-1 min-h-4 text-xs text-muted-foreground">{media.season !== null && media.season !== undefined ? `S${String(media.season).padStart(2, "0")}${media.episode !== null && media.episode !== undefined ? ` · E${String(media.episode).padStart(2, "0")}` : ""}` : ""}{media.episodeTitle ? `${media.season !== null && media.season !== undefined ? " · " : ""}${media.episodeTitle}` : ""}</p>}</>}{view === "list" && <><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{media.episodeOverview || media.overview}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(media.updatedAt).toLocaleDateString()}{media.durationMs ? ` · ${time(media.durationMs)}` : ""}</p></>}</div>{view === "list" && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
  </button>
  const renderMedia = (items: Media[]) => {
    const groups = new Map<string, Media[]>()
    for (const media of items) {
      const date = new Date(media.updatedAt)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      groups.set(key, [...(groups.get(key) ?? []), media])
    }
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    return <div className="space-y-7">{[...groups.entries()].map(([key, group]) => {
      const date = new Date(group[0].updatedAt)
      const groupDate = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
      const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`
      const title = groupDate === todayKey ? "Today" : groupDate === yesterdayKey ? "Yesterday" : date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined })
      return <section key={key} aria-label={title}><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h3><div className={view === "grid" ? "grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4" : "divide-y"}>{group.map(renderMediaCard)}</div></section>
    })}</div>
  }
  return <section className={`mx-auto max-w-5xl`}>
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">A little closer to fluent</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Watch</h1><p className="mt-3 text-sm text-muted-foreground">Your videos. The words you want to keep.</p></div>
      <Link href="/watch/connect" aria-label="Connect a browser" className="rounded-full border p-3 transition-colors hover:bg-muted"><Link2 className="size-5" /></Link>
    </header>
    {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
    {active && <button onClick={() => { setSelected(active.id); setHistory(false) }} className="mt-8 flex w-full items-center gap-4 rounded-2xl bg-primary/10 p-5 text-left transition-colors hover:bg-primary/15"><span className="relative flex size-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" /><span className="relative size-3 rounded-full bg-primary" /></span><span className="min-w-0 flex-1"><span className="text-xs font-semibold text-primary">LIVE NOW</span><span className="mt-1 block truncate font-medium">{active.title}</span></span><ChevronRight className="size-5 shrink-0" /></button>}
    {!data ? <p className="py-20 text-center text-sm text-muted-foreground">Loading your videos…</p> : !data.media.length && page === 0 ? <div className="mx-auto flex min-h-[55dvh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-6 rounded-3xl bg-primary/10 p-6"><MonitorPlay className="size-10 text-primary" /></div>
      <h2 className="text-2xl font-semibold tracking-tight">Watch there. Understand here.</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">Play YouTube or Stremio on your computer. Follow the subtitles here whenever you need a little help.</p>
      <Link href="/watch/connect" className="mt-7 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground">Connect your browser</Link>
    </div> : <>
      <div className="mb-3 mt-5 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-medium"><History className="size-4" /> Recently watched</h2><div className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:inline">Only captions you played</span><div role="group" aria-label="Display mode" className="flex rounded-lg border p-0.5"><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => changeView("list")} className={`rounded-md p-1.5 transition-colors ${view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}><List className="size-4" /></button><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => changeView("grid")} className={`rounded-md p-1.5 transition-colors ${view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid className="size-4" /></button></div></div></div>
      <label className="mb-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a video on this page" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" /></label>
      <div role="tablist" aria-label="Video source" className="mb-4 mt-5 flex gap-1 border-b">
        <button id="watch-tab-stremio" role="tab" aria-selected={sourceTab === "stremio"} aria-controls="watch-panel-stremio" onClick={() => setSourceTab("stremio")} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${sourceTab === "stremio" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Stremio <span className="ml-1 text-xs text-muted-foreground">{stremioMedia?.length ?? 0}</span></button>
        <button id="watch-tab-youtube" role="tab" aria-selected={sourceTab === "youtube"} aria-controls="watch-panel-youtube" onClick={() => setSourceTab("youtube")} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${sourceTab === "youtube" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>YouTube <span className="ml-1 text-xs text-muted-foreground">{youtubeMedia?.length ?? 0}</span></button>
      </div>
      <div id={`watch-panel-${sourceTab}`} role="tabpanel" aria-labelledby={`watch-tab-${sourceTab}`}>
        {(sourceTab === "youtube" ? youtubeMedia : stremioMedia)?.length ? renderMedia((sourceTab === "youtube" ? youtubeMedia : stremioMedia)!) : <p className="py-10 text-center text-sm text-muted-foreground">{query ? "No videos on this page match your search." : `No ${sourceTab === "youtube" ? "YouTube" : "Stremio"} videos yet.`}</p>}
      </div>
      {data.hasMore && <div ref={loadMoreRef} aria-hidden="true" className="h-10" />}{data.page !== page && page > 0 && <p role="status" className="py-4 text-center text-sm text-muted-foreground">Loading more videos…</p>}
    </>}
  </section>
}





function WatchReader({ mediaId, connected, onBack }: { mediaId: string; connected: boolean; onBack: () => void }) {
  const [track, setTrack] = useState("")
  const [following, setFollowing] = useState(true)
  const [savedOnly, setSavedOnly] = useState(false)
  const [showExpressions, setShowExpressions] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [expressions, setExpressions] = useState<SavedExpression[]>([])
  const [translationHistory, setTranslationHistory] = useState<TranslationHistoryItem[]>([])
  const [expressionBusy, setExpressionBusy] = useState(false)
  const [now, setNow] = useState(0)
  const [navigationTargetId, setNavigationTargetId] = useState<string | null>(null)
  const [bookmarkError, setBookmarkError] = useState("")
  const [videoStatusDismissed, setVideoStatusDismissed] = useState(false)
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(false)
  const [listeningMode, setListeningMode] = useState(false)
  const [revealedLines, setRevealedLines] = useState<Set<string>>(() => new Set())
  const [seekStep, setSeekStep] = useState(() => typeof window === "undefined" ? 10 : Number(window.localStorage.getItem("watch-seek-step") || 10))
  const [controlsSettingsOpen, setControlsSettingsOpen] = useState(false)
  const [nearSubtitleEnd, setNearSubtitleEnd] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const anchor = useRef<HTMLDivElement>(null)
  const [selectionMenu, setSelectionMenu] = useState<{ line: Line; text: string; selectedWords?: { lineId: string; index: number; text: string; active: boolean }[] } | null>(null)
  const [selectionMenuPosition, setSelectionMenuPosition] = useState({ top: 0, left: 0 })
  const [translationDrawer, setTranslationDrawer] = useState<{ open: boolean; text: string; context: string; selectedLine: string; loading: boolean; error: string; explanation: ExpressionExplanation | null }>({ open: false, text: "", context: "", selectedLine: "", loading: false, error: "", explanation: null })
  const [translationChat, setTranslationChat] = useState<TranslationChatMessage[]>([])
  const [translationId, setTranslationId] = useState<string | null>(null)
  const [translationMessage, setTranslationMessage] = useState("")
  const [translationChatBusy, setTranslationChatBusy] = useState(false)
  const translationChatScroller = useRef<HTMLDivElement>(null)
  const [vocabularyAddedSourceIds, setVocabularyAddedSourceIds] = useState<Set<string>>(() => new Set())
  const [vocabularyStatus, setVocabularyStatus] = useState("")
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressSeek = useRef(false)
  const touchRange = useRef<{ line: Line; words: string[]; start: number } | null>(null)
  const selectionMenuRef = useRef<HTMLDivElement>(null)
  const resumePlayback = useRef(false)
  useEffect(() => { setVocabularyStatus("") }, [selectionMenu?.line.id, selectionMenu?.text])
  useEffect(() => {
    const scroller = translationChatScroller.current
    if (!translationDrawer.open || !scroller) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
  }, [translationChat, translationChatBusy, translationDrawer.open])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      fetch(`/api/watch/expressions?mediaId=${encodeURIComponent(mediaId)}`, { cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null),
      fetch(`/api/watch/expressions/translate?mediaId=${encodeURIComponent(mediaId)}`, { cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null),
    ]).then(([saved, history]) => {
      if (saved) setExpressions(saved.expressions)
      if (history) setTranslationHistory(history.explanations)
    }).catch(() => {})
    return () => controller.abort()
  }, [mediaId])
  const loader = useCallback(async (signal: AbortSignal) => {
    const lines = new Map<string, Line>()
    let since = "", after = "", resolvedTrack = "", result: Transcript | null = null, firstTime = ""
    while (true) {
      const params = new URLSearchParams({ mediaId })
      if (track) params.set("trackId", track)
      if (since) params.set("since", since)
      if (after) params.set("after", after)
      result = await read<Transcript>(`/api/watch/library?${params}`, signal)
      if (resolvedTrack && result.trackId !== resolvedTrack) {
        lines.clear(); since = ""; after = ""; resolvedTrack = result.trackId || ""; firstTime = ""
        continue
      }
      resolvedTrack = result.trackId || ""
      if (!firstTime) firstTime = result.serverTime
      result.lines.forEach(line => lines.set(line.id, line))
      after = result.next || ""
      if (!after) break
    }
    if (!result) throw new Error("Could not load subtitles.")
    return { ...result, receivedAt: Date.now(), lines: [...lines.values()].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)) }
  }, [mediaId, track])
  const applyRealtime = useCallback((current: Transcript, event: Capture) => {
    if (event.mediaId !== mediaId) return current
    if (current.trackId && event.trackId !== current.trackId) return current
    const merged = new Map(current.lines.map(line => [line.id, line]))
    for (const line of event.lines) {
      if (event.trackId && line.trackId && line.trackId !== event.trackId) continue
      merged.set(line.id, line)
    }
    const newer = !current.session || Date.parse(event.session.updatedAt) >= Date.parse(current.session.updatedAt)
    return {
      ...current,
      lines: [...merged.values()].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
      session: newer ? event.session : current.session,
      activeLineIds: newer ? event.activeLineIds : current.activeLineIds,
      serverTime: newer ? event.serverTime : current.serverTime,
      receivedAt: Date.now(),
    }
  }, [mediaId])
  const { data, error } = useResource(loader, applyRealtime)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  const session = data?.session
  const elapsed = data ? Math.max(0, now - data.receivedAt) : 0
  const age = data && session ? Date.parse(data.serverTime) - Date.parse(session.capturedAt || session.updatedAt) + elapsed : Infinity
  const online = age < 15_000 && session && !["stopped", "ended"].includes(session.state)
  const isPlayingLive = Boolean(online && session?.state === "playing")
  const position = session ? Math.min(session.durationMs ?? Infinity, session.positionMs + (online && session.state === "playing" ? Math.min(2000, elapsed) * (session.playbackRate || 1) : 0)) : 0
  const lines = data?.lines ?? []
  const bookmarkedLineCount = data?.bookmarkedLineCount ?? lines.filter(line => line.bookmarked).length
  const activeIds = new Set(online && !["seeking", "waiting"].includes(session?.state || "") ? data?.activeLineIds : [])
  const activeLines = lines.filter(line => online && (line.approximate ? activeIds.has(line.id) : line.startMs <= position && line.endMs > position))
  const currentId = activeLines[0]?.id
  const previous = [...lines].reverse().find(line => line.startMs <= position)
  const targetId = currentId || previous?.id
  const visible = savedOnly ? lines.filter(line => line.bookmarked) : lines

  function followPlayback() {
    followingRef.current = true
    setFollowing(true)
    setSavedOnly(false)
    setShowExpressions(false)
    setShowHistory(false)
    setTrack("")
  }

  function scrollToLatest() {
    setSavedOnly(false)
    setShowExpressions(false)
    setShowHistory(false)
    requestAnimationFrame(() => {
      const box = scroller.current
      if (box) box.scrollTo({ top: box.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    })
  }

  function updateSubtitleEnd() {
    const box = scroller.current
    setNearSubtitleEnd(!box || box.scrollHeight - box.scrollTop - box.clientHeight <= 120)
  }

  function stopFollowing() {
    if (!followingRef.current) return
    followingRef.current = false
    setFollowing(false)
  }

  useEffect(() => {
    if (!following || savedOnly || !anchor.current || !scroller.current || window.getSelection()?.toString()) return
    const box = scroller.current, target = anchor.current
    box.scrollTo({ top: target.offsetTop - box.clientHeight * 0.34, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
  }, [targetId, following, savedOnly, visible.length])

  useEffect(() => {
    if (!navigationTargetId || showExpressions) return
    const frame = requestAnimationFrame(() => {
      const box = scroller.current
      const target = box?.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(navigationTargetId)}"]`)
      if (box && target) box.scrollTo({ top: target.offsetTop - box.clientHeight * 0.3, behavior: "smooth" })
      setNavigationTargetId(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [navigationTargetId, showExpressions, savedOnly, lines.length])

  function openSubtitleMoment(lineId: string, startMs: number) {
    setShowExpressions(false)
    setShowHistory(false)
    setSavedOnly(false)
    stopFollowing()
    setNavigationTargetId(lineId)
    void sendCommand("seek", startMs)
  }

  async function bookmark(line: Line) {
    stopFollowing()
    const bookmarked = !line.bookmarked
    setBusy(line.id); setBookmarkError("")
    try {
      const response = await fetch("/api/watch/bookmarks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: line.id, bookmarked }) })
      if (!response.ok) throw new Error("Could not save this caption. Try again.")
      changed()
    } catch (cause) { setBookmarkError(cause instanceof Error ? cause.message : "Could not save.") }
    finally { setBusy(null) }
  }

  async function saveExpression(line: Line, text: string) {
    const selected = text.trim().replace(/\s+/g, " ")
    if (!selected) return
    setExpressionBusy(true); setBookmarkError("")
    try {
      const response = await fetch("/api/watch/expressions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId, lineId: line.id, sessionId: session?.id ?? null, text: selected, startMs: line.startMs, endMs: line.endMs }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not save this expression.")
      setExpressions(current => [{ ...result.expression, inVocabulary: false }, ...current.filter(item => item.id !== result.expression.id)])
    } catch (cause) { setBookmarkError(cause instanceof Error ? cause.message : "Could not save expression.") }
    finally { setExpressionBusy(false) }
  }

  async function copyExpression(text: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const input = document.createElement("textarea")
        input.value = text
        input.style.position = "fixed"
        input.style.opacity = "0"
        document.body.append(input)
        input.select()
        document.execCommand("copy")
        input.remove()
      }
    } catch { setBookmarkError("Could not copy this expression.") }
    setSelectionMenu(null)
    resumePlayback.current = false
    void sendCommand("play")
  }

  async function explainExpression(line: Line, text: string) {
    setSelectionMenu(null)
    setTranslationId(null); setTranslationChat([]); setTranslationMessage("")
    const lineIndex = lines.findIndex(item => item.id === line.id)
    const context = lineIndex < 0 ? [line.text] : lines.slice(Math.max(0, lineIndex - 2), lineIndex + 3).map(item => item.text)
    const phraseContext = context.join("\n")
    setTranslationDrawer({ open: true, text, context: phraseContext, selectedLine: line.text, loading: true, error: "", explanation: null })
    try {
      const response = await fetch("/api/watch/expressions/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId, lineId: line.id, text, context: phraseContext }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not translate this expression.")
      setTranslationDrawer(current => ({ ...current, loading: false, explanation: result.explanation }))
      setTranslationId(result.id ?? null); setTranslationChat(result.chat ?? [])
      try {
        const historyResponse = await fetch(`/api/watch/expressions/translate?mediaId=${encodeURIComponent(mediaId)}`, { cache: "no-store" })
        if (historyResponse.ok) {
          const history = await historyResponse.json()
          setTranslationHistory(history.explanations)
        }
      } catch { /* History refresh should not invalidate the explanation. */ }
    } catch (cause) {
      setTranslationDrawer(current => ({ ...current, loading: false, error: cause instanceof Error ? cause.message : "Could not translate this expression." }))
    }
  }

  function speakPhrase(phrase: string) {
    if (!("speechSynthesis" in window) || !phrase.trim()) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(phrase)
    utterance.lang = "en-US"
    window.speechSynthesis.speak(utterance)
  }

  async function sendTranslationChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = translationMessage.trim()
    if (!message || !translationId || translationChatBusy) return
    setTranslationChatBusy(true); setTranslationDrawer(current => ({ ...current, error: "" }))
    try {
      const response = await fetch("/api/watch/expressions/translate/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ explanationId: translationId, message }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not send your message.")
      setTranslationChat(result.chat); setTranslationMessage("")
      setTranslationHistory(current => current.map(item => item.id === translationId ? { ...item, chat: result.chat } : item))
    } catch (cause) { setTranslationDrawer(current => ({ ...current, error: cause instanceof Error ? cause.message : "Could not send your message." })) }
    finally { setTranslationChatBusy(false) }
  }

  function toggleSelectedLineWord(line: Line, index: number) {
    const current = selectionMenu?.selectedWords || []
    const exists = current.some(word => word.lineId === line.id && word.index === index)
    const clicked = line.text.trim().split(/\s+/)[index]
    const nextWords = exists
      ? current.map(word => word.lineId === line.id && word.index === index ? { ...word, active: !word.active } : word)
      : clicked ? [...current, { lineId: line.id, index, text: clicked, active: true }] : current
    if (!nextWords.length) return
    const ordered = nextWords.sort((a, b) => {
      const lineOrder = lines.findIndex(item => item.id === a.lineId) - lines.findIndex(item => item.id === b.lineId)
      return lineOrder || a.index - b.index
    })
    const firstLine = lines.find(item => item.id === ordered[0].lineId) || line
    setSelectionMenu({ line: firstLine, selectedWords: ordered, text: ordered.map(word => word.text).join(" ") })
  }

  function openTranslationHistory(item: TranslationHistoryItem) {
    setTranslationId(item.id)
    setTranslationChat(item.chat || [])
    setTranslationMessage("")
    setTranslationDrawer({ open: true, text: item.text, context: item.context, selectedLine: item.line.text, loading: false, error: "", explanation: item.explanation })
  }

  function activeSelectionText(selection: NonNullable<typeof selectionMenu>) {
    return selection.selectedWords ? selection.selectedWords.filter(word => word.active).map(word => word.text).join(" ") : selection.text
  }

  function placeSelectionMenu(rect: DOMRect) {
    const height = 112
    const width = Math.min(480, window.innerWidth - 24)
    const top = rect.top > height + 16 ? rect.top - height - 10 : Math.min(window.innerHeight - height - 12, rect.bottom + 10)
    setSelectionMenuPosition({ top: Math.max(12, top), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) })
  }

  function captureNativeSelection() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !scroller.current) return
    const range = selection.getRangeAt(0)
    placeSelectionMenu(range.getBoundingClientRect())
    const selectedWords = Array.from(scroller.current.querySelectorAll<HTMLElement>("[data-word-index]"))
      .filter(node => { try { return range.intersectsNode(node) } catch { return false } })
      .map(node => {
        const lineId = node.closest<HTMLElement>("[data-line-id]")?.dataset.lineId
        const line = lines.find(item => item.id === lineId)
        return line ? { line, word: { lineId: line.id, index: Number(node.dataset.wordIndex), text: node.textContent || "", active: true } } : null
      })
      .filter((item): item is { line: Line; word: { lineId: string; index: number; text: string; active: boolean } } => Boolean(item))
    if (!selectedWords.length) return
    const ordered = selectedWords.map(item => item.word)
    const firstLine = selectedWords[0].line
    setSelectionMenu({ line: firstLine, selectedWords: ordered, text: ordered.map(word => word.text).join(" ") })
    suppressSeek.current = true
    resumePlayback.current = session?.state === "playing"
    void sendCommand("pause")
  }

  async function sendCommand(action: "play" | "pause" | "seek", positionMs?: number) {
    setBookmarkError("")
    try {
      const response = await fetch("/api/watch/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId, command: action, ...(positionMs === undefined ? {} : { positionMs }) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not control this video.")
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not control this video."
        if (message === "This video is no longer connected.") {
          setVideoStatusDismissed(false)
          setBookmarkError("")
        } else setBookmarkError(message)
      }
  }

  function seekBy(deltaSeconds: number) {
    if (!session) return
    void sendCommand("seek", Math.max(0, Math.min(session.durationMs ?? Number.MAX_SAFE_INTEGER, position + deltaSeconds * 1000)))
  }

  function revealLine(lineId: string) {
    setRevealedLines(current => new Set(current).add(lineId))
  }

  useEffect(() => {
    if (!selectionMenu) return
    const outside = (event: PointerEvent) => {
      if (selectionMenuRef.current?.contains(event.target as Node)) return
      setSelectionMenu(null)
      resumePlayback.current = false
      void fetch("/api/watch/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId, command: "play" }) })
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [selectionMenu, mediaId])

  const currentSelectionText = selectionMenu ? activeSelectionText(selectionMenu) : ""
  const currentSelectionSourceId = selectionMenu ? watchVocabularySourceId(mediaId, selectionMenu.line.startMs, currentSelectionText) : ""
  const currentSelectionInVocabulary = !!currentSelectionSourceId && vocabularyAddedSourceIds.has(currentSelectionSourceId)

  return <section className="relative mx-auto flex h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] min-h-0 max-w-4xl flex-col overflow-hidden lg:mx-0 lg:w-full lg:max-w-none lg:h-[calc(100dvh-7rem)] lg:min-h-80">
    {!data ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{error || "Loading subtitles…"}</div> : <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,34fr)_minmax(0,66fr)] lg:gap-6">
      <aside className="hidden min-h-0 flex-col rounded-2xl border bg-card p-5 lg:flex">
        <div className="flex items-center justify-between"><button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Your videos</button><Link href="/watch/connect" aria-label="Browser connections" className="rounded-full p-2 text-muted-foreground hover:bg-muted"><Link2 className="size-4" /></Link></div>
        <div className="mt-6 flex min-h-0 items-start gap-4"><Cover media={{ ...data.media, thumbnail: data.media.episodeThumbnail || data.media.thumbnail }} poster /><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{data.media.mediaType === "series" ? "TV Series" : data.media.mediaType === "movie" ? "Movie" : data.media.source}{data.media.year ? ` · ${data.media.year}` : ""}</p><h1 className="mt-1 line-clamp-3 text-lg font-semibold leading-snug">{data.media.title}</h1>{data.media.mediaType === "series" && (data.media.episodeTitle || data.media.season != null) && <p className="mt-1 text-xs text-muted-foreground">{data.media.season != null ? `Season ${data.media.season}${data.media.episode != null ? ` · Episode ${data.media.episode}` : ""}` : ""}{data.media.episodeTitle ? `${data.media.season != null ? " · " : ""}${data.media.episodeTitle}` : ""}</p>}{(data.media.episodeOverview || data.media.overview) && <p className="mt-2 line-clamp-6 text-left text-xs leading-5 text-muted-foreground">{data.media.episodeOverview || data.media.overview}</p>}<p className="mt-3 text-xs tabular-nums text-muted-foreground">{time(position)}{data.media.durationMs ? ` / ${time(data.media.durationMs)}` : ""}</p></div></div>
        <div className="mt-8 space-y-2 border-t pt-5"><div className="flex items-center gap-2 text-xs text-muted-foreground">{connected ? <Radio className="size-3.5 text-primary" /> : <WifiOff className="size-3.5" />}<span>{connected ? "Server connection active" : "Connecting to server…"}</span></div>{!online && !videoStatusDismissed && <div className="flex items-start justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"><span>Stremio is not connected. Open Stremio with the Tampermonkey script enabled to sync playback. Saved subtitles are still available for offline review.</span><button type="button" aria-label="Dismiss video status" onClick={() => setVideoStatusDismissed(true)} className="-mr-1 -mt-1 shrink-0 rounded p-1 hover:bg-background"><X className="size-3.5" /></button></div>}{data.media.tracks.length > 1 && <select aria-label="Subtitle track" value={track || data.trackId || ""} onChange={event => { setTrack(event.target.value); setFollowing(false) }} className="w-full rounded-lg bg-muted px-2 py-2 text-xs">{data.media.tracks.map((item, index) => <option key={item.id} value={item.id}>{item.language || `Track ${index + 1}`}</option>)}</select>}</div>
    <div className="mt-auto flex flex-col gap-2 border-t pt-5"><button aria-pressed={!showExpressions && !savedOnly && !showHistory} onClick={() => { setShowExpressions(false); setSavedOnly(false); setShowHistory(false); setFollowing(true) }} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${!showExpressions && !savedOnly && !showHistory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Captions className="size-4" /> Subtitles <span className="ml-auto">{lines.length}</span></button><button aria-pressed={showExpressions} onClick={() => { setShowExpressions(true); setSavedOnly(false); setShowHistory(false); setFollowing(false) }} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${showExpressions ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Bookmark className="size-4" /> Marked <span className="ml-auto">{expressions.length}</span></button><button aria-pressed={savedOnly} onClick={() => { setSavedOnly(true); setShowExpressions(false); setShowHistory(false); setFollowing(false) }} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${savedOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><ListVideo className="size-4" /> Lines <span className="ml-auto">{bookmarkedLineCount}</span></button><button aria-pressed={showHistory} onClick={() => { setShowHistory(true); setShowExpressions(false); setSavedOnly(false); setFollowing(false) }} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${showHistory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><History className="size-4" /> Translation and usage history <span className="ml-auto">{translationHistory.length}</span></button></div>
      </aside>
      <div className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:rounded-2xl lg:border lg:bg-card lg:px-6">
      <div className="flex h-6 shrink-0 items-center justify-between lg:hidden"><button type="button" onClick={onBack} aria-label="Your videos" title="Your videos" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"><ArrowLeft className="size-3" />Your videos</button><button type="button" aria-label={mobileInfoExpanded ? "Collapse video information" : "Expand video information"} aria-expanded={mobileInfoExpanded} onClick={() => setMobileInfoExpanded(value => !value)} className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronDown className={`size-4 transition-transform duration-200 ${mobileInfoExpanded ? "rotate-180" : ""}`} /></button></div>
      <header className={`${mobileInfoExpanded ? "flex" : "hidden"} shrink-0 items-center gap-2 border-b pb-2 sm:gap-3 lg:hidden`}>
        {mobileInfoExpanded && <Cover media={data.media} large />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>{data.media.source}</span>
            <span>·</span>
            <span className={online ? "text-primary" : ""}>{online ? session?.state === "paused" ? "Paused" : "Now watching" : "Saved transcript"}
            </span>
          </div>
          <h1 className="mt-0.5 line-clamp-1 text-sm font-semibold leading-snug tracking-tight sm:text-lg">
            {data.media.title}
          </h1>
          {mobileInfoExpanded && data.media.mediaType === "series" && data.media.episodeTitle && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{data.media.episodeTitle}</p>}
          {mobileInfoExpanded && (data.media.episodeOverview || data.media.overview) && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{data.media.episodeOverview || data.media.overview}</p>}
          {mobileInfoExpanded && <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{time(position)}{data.media.durationMs ? ` / ${time(data.media.durationMs)}` : ""}</p>}
          {mobileInfoExpanded && <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            {connected ? <Radio className="size-3 shrink-0 text-primary" /> : <WifiOff className="size-3 shrink-0" />}<span>{connected ? "Server connected" : "Server reconnecting"}</span>{data.media.tracks.length > 1 && <select aria-label="Subtitle track" value={track || data.trackId || ""} onChange={event => { setTrack(event.target.value); setFollowing(false) }} className="max-w-28 rounded-lg bg-muted px-1.5 py-1 text-[10px]">{data.media.tracks.map((item, index) => <option key={item.id} value={item.id}>{item.language || `Track ${index + 1}`}</option>)}</select>}
          </div>}
        </div>
      </header>
      <div className={`${isPlayingLive ? "hidden" : "flex"} shrink-0 items-center justify-between gap-2 border-b py-1.5 lg:hidden`}>

      <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto"><button aria-pressed={!showExpressions && !savedOnly && !showHistory} onClick={() => { setShowExpressions(false); setSavedOnly(false); setShowHistory(false); setFollowing(true) }} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] ${!showExpressions && !savedOnly && !showHistory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Captions className="size-3" /> Subtitles {lines.length}</button><button aria-pressed={showExpressions} onClick={() => { setShowExpressions(true); setSavedOnly(false); setShowHistory(false); setFollowing(false) }} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] ${showExpressions ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Bookmark className="size-3" /> Marked {expressions.length}</button><button aria-pressed={savedOnly} onClick={() => { setSavedOnly(true); setShowExpressions(false); setShowHistory(false); setFollowing(false) }} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] ${savedOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><ListVideo className="size-3" /> Lines {bookmarkedLineCount}</button><button aria-pressed={showHistory} onClick={() => { setShowHistory(true); setShowExpressions(false); setSavedOnly(false); setFollowing(false) }} className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] ${showHistory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><History className="size-3" /> History {translationHistory.length}</button></div>
      </div>
      {(error || bookmarkError) && <p role="alert" className="py-2 text-xs text-destructive">{bookmarkError || error}</p>}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} tabIndex={0} aria-label="Subtitles" onScroll={updateSubtitleEnd} onWheel={stopFollowing} onTouchMove={stopFollowing} onPointerDown={event => { if (event.pointerType === "mouse") stopFollowing() }} onKeyDown={event => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) stopFollowing() }} onMouseUp={() => { if (window.getSelection()?.toString()) { stopFollowing(); captureNativeSelection() } }} className={`relative h-full overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${listeningMode ? "watch-listening-surface" : ""}`}>
          {showHistory ? <div className="space-y-3 pb-20 pt-4">{translationHistory.length ? translationHistory.map(item => <button key={item.id} type="button" onClick={() => openTranslationHistory(item)} className="block w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/50"><span className="block font-semibold text-primary">{item.text}</span><span className="mt-2 block text-sm text-muted-foreground">{item.line.text}</span><span className="mt-2 block text-xs text-muted-foreground">{time(item.line.startMs)} · {new Date(item.updatedAt).toLocaleDateString()}</span></button>) : <p className="py-16 text-center text-sm text-muted-foreground">Expressions you translate and explain will appear here.</p>}</div> : showExpressions ? <div className="space-y-3 overflow-y-auto pb-20 pt-4">{expressions.length ? expressions.map(expression => {
            const sourceLine: Line = { id: expression.lineId, text: expression.context, startMs: expression.startMs, endMs: expression.endMs, approximate: false, bookmarked: false }
            const vocabularySourceId = watchVocabularySourceId(mediaId, expression.startMs, expression.text)
            const alreadyInVocabulary = expression.inVocabulary || vocabularyAddedSourceIds.has(vocabularySourceId)
            return <article key={expression.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-left font-semibold text-primary">{expression.text}</p><p className="mt-2 text-sm text-muted-foreground">{expression.context}</p><p className="mt-1 text-xs text-muted-foreground">{data.media.title} · {time(expression.startMs)}</p></div><div className="flex flex-wrap justify-end gap-2"><button type="button" aria-label="Translation and usage" title="Translation and usage" onClick={event => { event.stopPropagation(); void explainExpression(sourceLine, expression.text) }} className="rounded-full bg-muted p-2"><Languages className="size-4" /></button><button type="button" aria-label="Open subtitle at this moment" title="Open subtitle at this moment" onClick={event => { event.stopPropagation(); openSubtitleMoment(expression.lineId, expression.startMs) }} className="rounded-full bg-muted p-2"><Captions className="size-4" /></button>{alreadyInVocabulary ? <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary"><Check className="size-3" />In Vocabulary</span> : <VocabularyAddDialog key={vocabularySourceId} term={expression.text} context={expression.context} source={{ title: data.media.title, id: vocabularySourceId }} triggerClassName="h-8" onAdded={savedTerm => { setVocabularyAddedSourceIds(current => new Set(current).add(vocabularySourceId)); setVocabularyStatus(`Saved “${savedTerm}” to Vocabulary`) }} />}<button type="button" aria-label="Remove marked expression" onClick={async () => { const response = await fetch(`/api/watch/expressions?id=${encodeURIComponent(expression.id)}`, { method: "DELETE" }); if (response.ok) setExpressions(current => current.filter(item => item.id !== expression.id)) }} className="px-2 text-muted-foreground">×</button></div></div></article>
          }) : <p className="py-16 text-center text-sm text-muted-foreground">Long press a word or select a phrase to ask AI or highlight it.</p>}</div> : !visible.length ? <div className="flex h-full min-h-40 flex-col items-center justify-center px-5 text-center"><p className="text-lg font-medium">{savedOnly ? "Keep a line for later" : "Listening for the next line…"}</p><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{savedOnly ? "Tap the bookmark beside a subtitle to collect phrases you want to revisit." : "Enable captions in your video player. Only the parts you play will appear here."}</p></div> : <div className="space-y-1.5 pb-[40dvh] pt-4 sm:space-y-2 sm:pt-6">{visible.map(line => {
            const isActive = activeLines.some(item => item.id === line.id)
            const saved = line.bookmarked
            return <div key={line.id} data-line-id={line.id} ref={line.id === targetId ? anchor : undefined} aria-current={isActive ? "true" : undefined} className={`watch-subtitle-row group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0 rounded-xl border border-transparent px-2 py-1.5 transition-all duration-200 sm:gap-x-4 sm:px-3 sm:py-2 ${isActive ? "watch-subtitle-active border-primary/20 bg-primary/[0.045] shadow-sm shadow-primary/5" : "hover:border-border/60 hover:bg-muted/30"}`}>
              <div className="col-span-1 flex min-w-0 items-start gap-2"><div className="min-w-0 flex-1"
                onPointerDown={event => {
                  if (selectionMenu) { suppressSeek.current = true; return }
                  suppressSeek.current = false
                  if (event.pointerType === "mouse") {
                    const target = event.target instanceof HTMLElement ? event.target.closest("[data-word]") : null
                    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-word]"))
                    const words = nodes.map(node => node.dataset.word || node.textContent || "")
                    const start = target ? nodes.indexOf(target as HTMLElement) : -1
                    const word = start >= 0 ? words[start] : line.text
                    touchRange.current = start >= 0 ? { line, words, start } : null
                    pressTimer.current = setTimeout(() => { suppressSeek.current = true; if (listeningMode && !revealedLines.has(line.id)) { revealLine(line.id); return } resumePlayback.current = session?.state === "playing"; if (target) placeSelectionMenu((target as HTMLElement).getBoundingClientRect()); setSelectionMenu({ line, text: word, selectedWords: start >= 0 ? [{ lineId: line.id, index: start, text: words[start], active: true }] : [] }); void sendCommand("pause") }, 550)
                  }
                }}
                onPointerMove={event => {
                  const range = touchRange.current
                  if (!range || !suppressSeek.current || event.pointerType !== "mouse") return
                  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-word]")
                  if (!target || !event.currentTarget.contains(target)) return
                  const nodes = Array.from(event.currentTarget.querySelectorAll("[data-word]"))
                  const end = nodes.indexOf(target)
                  if (end < 0) return
                  const from = Math.min(range.start, end), to = Math.max(range.start, end)
                  const selectedWords = nodes.slice(from, to + 1).map((node, offset) => ({ lineId: range.line.id, index: from + offset, text: node.textContent || "", active: true }))
                  placeSelectionMenu(target.getBoundingClientRect())
                  setSelectionMenu({ line: range.line, selectedWords, text: selectedWords.map(word => word.text).join(" ") })
                }}
                onPointerUp={event => {
                  if (pressTimer.current) clearTimeout(pressTimer.current)
                  if (event.pointerType === "mouse") { touchRange.current = null; stopFollowing() }
                  if (selectionMenu) return
                  const selected = window.getSelection()?.toString().trim()
                  if (selected && event.currentTarget.contains(window.getSelection()?.anchorNode || null)) { suppressSeek.current = true; resumePlayback.current = session?.state === "playing"; setSelectionMenu({ line, text: selected }); void sendCommand("pause") }
                }}
                onPointerLeave={() => { if (pressTimer.current) clearTimeout(pressTimer.current) }}
                onTouchStart={event => {
                  if (selectionMenu) { suppressSeek.current = true; return }
                  const target = event.target instanceof HTMLElement ? event.target.closest("[data-word]") : null
                  const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-word]"))
                  const words = nodes.map(node => node.dataset.word || node.textContent || "")
                  const start = target ? nodes.indexOf(target as HTMLElement) : -1
                  const word = start >= 0 ? words[start] : line.text
                  touchRange.current = start >= 0 ? { line, words, start } : null
                  pressTimer.current = setTimeout(() => { suppressSeek.current = true; if (listeningMode && !revealedLines.has(line.id)) { revealLine(line.id); return } resumePlayback.current = session?.state === "playing"; if (target) placeSelectionMenu((target as HTMLElement).getBoundingClientRect()); setSelectionMenu({ line, text: word, selectedWords: start >= 0 ? [{ lineId: line.id, index: start, text: words[start], active: true }] : [] }); void sendCommand("pause") }, 550)
                }}
                onTouchMove={event => {
                  stopFollowing()
                  const range = touchRange.current
                  if (!range || !suppressSeek.current) return
                  event.preventDefault()
                  const touch = event.touches[0]
                  const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-word]")
                  if (!target || !event.currentTarget.contains(target)) return
                  const nodes = Array.from(event.currentTarget.querySelectorAll("[data-word]"))
                  const end = nodes.indexOf(target)
                  if (end < 0) return
                  const from = Math.min(range.start, end), to = Math.max(range.start, end)
                  const selectedWords = nodes.slice(from, to + 1).map((node, offset) => ({ lineId: range.line.id, index: from + offset, text: node.textContent || "", active: true }))
                  placeSelectionMenu(target.getBoundingClientRect())
                  setSelectionMenu({ line: range.line, selectedWords, text: selectedWords.map(word => word.text).join(" ") })
                }}
                onTouchEnd={event => {
                  if (pressTimer.current) clearTimeout(pressTimer.current)
                  touchRange.current = null
                  if (selectionMenu) return
                  const selected = window.getSelection()?.toString().trim()
                  if (selected && event.currentTarget.contains(window.getSelection()?.anchorNode || null)) { suppressSeek.current = true; resumePlayback.current = session?.state === "playing"; setSelectionMenu({ line, text: selected }); void sendCommand("pause") }
                }}
                onClick={() => { if (selectionMenu || suppressSeek.current) { suppressSeek.current = false; return } followingRef.current = true; setFollowing(true); setSavedOnly(false); setShowExpressions(false); setShowHistory(false); void sendCommand("seek", line.startMs) }}
                className="relative w-full cursor-pointer select-none touch-pan-y text-left">
                <span className={`watch-subtitle-copy whitespace-pre-line break-words text-[clamp(1.25rem,4.2vw,2.25rem)] font-semibold leading-[1.4] tracking-tight transition-colors duration-200 ${listeningMode && !revealedLines.has(line.id) ? "watch-subtitle-hidden" : listeningMode ? "watch-subtitle-revealed" : ""} ${isActive ? "text-primary" : following && online ? "text-muted-foreground/65" : "text-foreground/85"}`}>{listeningMode && !revealedLines.has(line.id) ? line.text.replace(/\S/g, "*") : (() => { let wordIndex = -1; return line.text.split(/(\s+)/).map((piece, index) => {
                  if (/\s+/.test(piece)) return piece
                  wordIndex += 1
                  const normalizedPiece = piece.toLocaleLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "")
                  const marked = expressions.some(saved => saved.lineId === line.id && saved.text.toLocaleLowerCase().split(/\s+/).some(word => word.replace(/[^\p{L}\p{N}'-]/gu, "") === normalizedPiece))
                  const selected = selectionMenu?.selectedWords?.some(word => word.lineId === line.id && word.index === wordIndex && word.active)
                  return <span key={index} data-word={piece.replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, "")} data-word-index={wordIndex} className={marked || selected ? "text-primary" : undefined}>{piece}</span>
                })})()}</span>
              </div></div>
              <div className="col-span-1 mt-1 flex shrink-0 flex-col gap-1"><button aria-label="Translation and usage" title="Translation and usage" onClick={event => { event.stopPropagation(); void explainExpression(line, line.text) }} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><Languages className="size-4" /></button><button aria-label={saved ? "Remove from saved captions" : "Save caption for later"} aria-pressed={saved} disabled={busy === line.id} onClick={() => bookmark(line)} className={`flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${saved ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:bg-muted hover:text-foreground"}`}><Bookmark className={`size-4 ${saved ? "fill-current" : ""}`} /></button></div>
              <span className={`col-span-1 mt-1 inline-flex w-fit items-center rounded-full bg-muted/55 px-2 py-0.5 text-[10px] tabular-nums transition-colors ${isActive ? "font-semibold text-primary" : "text-muted-foreground/70"}`}>{line.approximate ? "≈ " : ""}{time(line.startMs)}</span>
            </div>
          })}</div>}
        </div>
        {selectionMenu && <div ref={selectionMenuRef}>
          <SelectionMenu
            words={selectionMenu.selectedWords?.map(word => ({ key: `${word.lineId}:${word.index}`, text: word.text, active: word.active }))}
            text={selectionMenu.text}
            position={selectionMenuPosition}
            busy={expressionBusy}
            vocabulary={currentSelectionText && !currentSelectionInVocabulary ? { term: currentSelectionText, context: selectionMenu.line.text, source: { title: data.media.title, id: currentSelectionSourceId }, onAdded: savedTerm => { setVocabularyAddedSourceIds(current => new Set(current).add(currentSelectionSourceId)); setVocabularyStatus(`Saved “${savedTerm}” to Vocabulary`) } } : undefined}
            onToggleWord={key => { const [lineId, index] = key.split(":"); const line = lines.find(item => item.id === lineId); if (line) toggleSelectedLineWord(line, Number(index)) }}
            onTranslate={text => void explainExpression(selectionMenu.line, text)}
            onHighlight={text => { void saveExpression(selectionMenu.line, text); setSelectionMenu(null) }}
            onCopy={text => void copyExpression(text)}
            onClose={() => { setSelectionMenu(null); resumePlayback.current = false; void sendCommand("play") }}
          />
          {vocabularyStatus && <p role="status" className="px-2 py-1 text-center text-xs text-muted-foreground">{vocabularyStatus}</p>}
        </div>}
        {!showExpressions && !savedOnly && !showHistory && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-center pb-1">
          {online && (!following || savedOnly) ? <button onClick={followPlayback} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 pointer-events-auto items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-medium text-primary-foreground shadow-lg"><ArrowDown className="size-4" />Back to live</button> : !online && !following && !nearSubtitleEnd ? <button type="button" aria-label="Scroll to latest subtitles" title="Latest subtitles" onClick={scrollToLatest} className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 flex size-11 pointer-events-auto items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"><ArrowDown className="size-5" /></button> : <span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-2 text-[10px] text-muted-foreground"><Check className="size-3" />{online ? currentId ? "Following playback" : "Between captions" : `${lines.length} captions saved`}</span>}
        </div>}
      </div>
      </div>
    </div>}
    <div className="watch-control-dock fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-3 border-t border-border/70 bg-background/90 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-xl backdrop-blur-xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:rounded-full lg:border lg:px-4">
      <button type="button" aria-label={`Rewind ${seekStep} seconds`} disabled={!online || !connected} onClick={() => seekBy(-seekStep)} className="watch-control-button flex size-11 items-center justify-center rounded-full bg-muted/80 text-foreground disabled:opacity-40"><Rewind className="size-5" /></button>
      <button type="button" aria-label={session?.state === "paused" ? "Play video" : "Pause video"} disabled={!online || !connected} onClick={() => void sendCommand(session?.state === "paused" ? "play" : "pause")} className="watch-play-button flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-40">{session?.state === "paused" ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}</button>
      <button type="button" aria-label={`Forward ${seekStep} seconds`} disabled={!online || !connected} onClick={() => seekBy(seekStep)} className="watch-control-button flex size-11 items-center justify-center rounded-full bg-muted/80 text-foreground disabled:opacity-40"><FastForward className="size-5" /></button>
      <button type="button" aria-pressed={listeningMode} aria-label="Listening mode" onClick={() => { setListeningMode(value => !value); setRevealedLines(new Set()) }} className={`watch-control-button flex size-11 items-center justify-center rounded-full ${listeningMode ? "bg-primary text-primary-foreground" : "bg-muted/80 text-foreground"}`}><Ear className="size-5" /></button>
      <button type="button" aria-label="Playback settings" onClick={() => setControlsSettingsOpen(true)} className="watch-control-button flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><Settings className="size-5" /></button>
    </div>
    <Drawer open={controlsSettingsOpen} onOpenChange={setControlsSettingsOpen} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="[--drawer-inset:0px] inset-x-0 bottom-0 m-0 flex h-auto max-h-[70dvh] w-full flex-col overflow-hidden rounded-t-xl rounded-b-none border-0 bg-background shadow-2xl">
        <DrawerHeader className="shrink-0 border-b px-5 pb-4 pt-5 text-left"><DrawerTitle>Playback controls</DrawerTitle><DrawerDescription>Choose how far each skip button moves.</DrawerDescription></DrawerHeader>
        <div className="space-y-5 px-5 py-6">
          <label className="flex items-center justify-between gap-4 text-sm font-medium">Skip interval <select value={seekStep} onChange={event => { const value = Number(event.target.value); setSeekStep(value); window.localStorage.setItem("watch-seek-step", String(value)) }} className="rounded-lg bg-muted px-3 py-2">{[5, 10, 15, 30, 60].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label>
          <button type="button" aria-pressed={listeningMode} onClick={() => { setListeningMode(value => !value); setRevealedLines(new Set()) }} className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${listeningMode ? "bg-primary text-primary-foreground" : "bg-muted"}`}><Ear className="size-4" />{listeningMode ? "Listening mode on" : "Turn on listening mode"}</button>
        </div>
      </DrawerContent>
    </Drawer>
    <Drawer open={translationDrawer.open} onOpenChange={open => setTranslationDrawer(current => ({ ...current, open }))} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="[--drawer-inset:0px] inset-x-0 bottom-0 m-0 flex h-[min(88dvh,54rem)] max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl rounded-b-none border-0 bg-background shadow-2xl">
        <DrawerHeader className="shrink-0 border-b bg-background px-5 pb-4 pt-5 text-left sm:px-7">
          <DrawerTitle className="text-lg">Translation and usage</DrawerTitle>
          <DrawerDescription className="mt-2 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-muted/60 px-3 py-2.5 text-sm font-medium leading-6 text-foreground">{translationDrawer.text}</DrawerDescription>
        </DrawerHeader>
        <div ref={translationChatScroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          {translationDrawer.loading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Generating explanation...</div>}
          {translationDrawer.error && <p role="alert" className="text-sm text-destructive">{translationDrawer.error}</p>}
          {translationDrawer.context && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Word in context</h3><p className="mt-1 whitespace-pre-line text-sm leading-6">{(() => {
            const context = translationDrawer.context
            const phrase = translationDrawer.text.trim()
            const start = phrase ? context.indexOf(phrase) : -1
            if (start < 0) return context
            return <>{context.slice(0, start)}<mark className="rounded bg-yellow-300/70 px-0.5 text-foreground dark:bg-yellow-500/40">{context.slice(start, start + phrase.length)}</mark>{context.slice(start + phrase.length)}</>
          })()}</p><button type="button" onClick={() => speakPhrase(translationDrawer.selectedLine)} className="mt-2 inline-flex items-center gap-2 rounded-full bg-background px-3 py-2 text-xs font-medium hover:bg-background/80"><Volume2 className="size-4" />Listen to phrase</button></section>}
          {translationDrawer.explanation && <>
            <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meaning in this context</h3><p className="mt-1 text-sm leading-6">{translationDrawer.explanation.contextMeaning}</p><h3 className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Russian translation</h3><p className="mt-1 text-lg font-medium">{translationDrawer.explanation.wordTranslation}</p></section>
            <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full line in Russian</h3><p className="mt-1 text-base leading-7">{translationDrawer.explanation.contextTranslation}</p></section>
            <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How to use it</h3><p className="mt-1 text-sm leading-6">{translationDrawer.explanation.usage}</p></section>
            {translationDrawer.explanation.otherMeanings.length > 0 && <section><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other common meanings</h3><div className="mt-2 space-y-3">{translationDrawer.explanation.otherMeanings.map((item, index) => <article key={`${item.meaning}-${index}`} className="rounded-xl bg-muted/70 p-3"><p className="font-medium">{item.meaning}</p><p className="mt-1 text-sm">{item.translation}</p><blockquote className="mt-3 border-l-2 pl-3 text-sm italic">{item.example}</blockquote><p className="mt-1 pl-3 text-sm text-muted-foreground">{item.exampleTranslation}</p></article>)}</div></section>}
            {translationDrawer.explanation.notes && <section className="rounded-xl bg-muted/70 p-3"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Usage notes</h3><p className="mt-1 text-sm leading-6">{translationDrawer.explanation.notes}</p></section>}
          </>}
          {translationChat.length > 0 && <section className="space-y-5 border-t pt-5">{translationChat.map((message, index) => <article key={`${index}-${message.role}`} className={message.role === "user" ? "ml-auto w-fit min-w-0 max-w-[min(82%,36rem)] rounded-3xl bg-sky-100 px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm dark:bg-sky-950/70 dark:text-sky-50" : "w-full py-1 text-sm leading-6 text-foreground"}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <p className="whitespace-pre-wrap [overflow-wrap:anywhere] [&+p]:mt-2">{children}</p>, ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>, ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>, li: ({ children }) => <li>{children}</li>, strong: ({ children }) => <strong className="font-semibold">{children}</strong>, em: ({ children }) => <em>{children}</em>, h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>, h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold">{children}</h2>, h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>, blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic">{children}</blockquote>, code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>, pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-2 text-xs">{children}</pre> }}>{message.content}</ReactMarkdown></article>)}</section>}
          {translationDrawer.error && <p role="alert" className="text-sm text-destructive">{translationDrawer.error}</p>}
        </div>
        <form onSubmit={event => void sendTranslationChat(event)} className="shrink-0 border-t bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-7">
          <div className="flex items-end gap-1.5 rounded-3xl border bg-muted/40 p-1.5 focus-within:ring-2 focus-within:ring-primary/20">
            <textarea rows={1} value={translationMessage} onChange={event => { setTranslationMessage(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 128)}px` }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); if (translationMessage.trim() && translationId && !translationChatBusy) event.currentTarget.form?.requestSubmit() } }} disabled={!translationId || translationChatBusy} placeholder="Ask a follow-up question…" className="max-h-32 min-h-7 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-50" />
            <button type="submit" disabled={!translationId || translationChatBusy || !translationMessage.trim()} aria-label="Send message" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40">{translationChatBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDown className="size-3.5 -rotate-90" />}</button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  </section>
}







