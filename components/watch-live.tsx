"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronRight, History, LayoutGrid, Link2, List, MonitorPlay, Search } from "lucide-react"

type Playback = { positionMs: number; state: string; updatedAt: string; capturedAt: string | null }
type Media = { id: string; title: string; source: string; thumbnail: string | null; durationMs: number | null; updatedAt: string; mediaType?: "movie" | "series"; year?: string | null; overview?: string | null; episodeTitle?: string | null; episodeOverview?: string | null; season?: number | null; episode?: number | null; sessions?: Playback[] }
type Library = { media: Media[]; hasMore: boolean; serverTime: string; page: number }
const time = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` }
async function read<T>(url: string, signal: AbortSignal): Promise<T> { const response = await fetch(url, { cache: "no-store", signal }); if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again." : "Could not load Watch. Reconnecting�"); return response.json() as Promise<T> }
function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); let loading = false, queued = false; async function refresh() { if (loading) { queued = true; return }; loading = true; do { queued = false; try { const result = await loader(controller.signal); if (!controller.signal.aborted) { setData(result); setError("") } } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Connection lost.") } } while (queued && !controller.signal.aborted); loading = false }; void refresh(); const onChanged = () => void refresh(); window.addEventListener("lexi-watch-changed", onChanged); return () => { controller.abort(); window.removeEventListener("lexi-watch-changed", onChanged) } }, [loader]); return { data, error }
}
function useConnection() {
 const [connected, setConnected] = useState(false)
 useEffect(() => { let socket: WebSocket | null = null, stopped = false, attempt = 0; let timer: ReturnType<typeof setTimeout> | undefined, handshake: ReturnType<typeof setTimeout> | undefined
 function retry(current: WebSocket) { if (stopped || socket !== current) return; if (handshake) clearTimeout(handshake); setConnected(false); socket = null; if (timer) clearTimeout(timer); timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++)) }
 function connect() { if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return; if (timer) clearTimeout(timer); const current = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/watch/socket`); socket = current; handshake = setTimeout(() => { if (socket === current && current.readyState !== WebSocket.OPEN) { current.close(); retry(current) } }, 8000); current.onopen = () => { if (socket !== current) return; if (handshake) clearTimeout(handshake); attempt = 0; setConnected(true); window.dispatchEvent(new CustomEvent("lexi-watch-changed")) }; current.onmessage = () => window.dispatchEvent(new CustomEvent("lexi-watch-changed")); current.onerror = () => { current.close(); retry(current) }; current.onclose = () => retry(current) }
 function wake() { if (document.visibilityState === "visible") { window.dispatchEvent(new CustomEvent("lexi-watch-changed")); connect() } }; connect(); const timerId = setInterval(() => { if (document.visibilityState === "visible") window.dispatchEvent(new CustomEvent("lexi-watch-changed")) }, 15000); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake); return () => { stopped = true; if (timer) clearTimeout(timer); if (handshake) clearTimeout(handshake); clearInterval(timerId); socket?.close(); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake) } }, []); return connected
}
function Cover({ media, poster = false, fluidPoster = false }: { media: Media; poster?: boolean; fluidPoster?: boolean }) { return <div className={`${poster ? "block aspect-[2/3] w-full" : "aspect-video w-28 sm:w-32"} relative ${fluidPoster ? "" : "shrink-0"} overflow-hidden rounded-md bg-primary/10 text-primary`}><MonitorPlay className="absolute inset-0 m-auto size-6" />{media.thumbnail && <img src={media.thumbnail} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.style.display = "none" }} />}</div> }
export function WatchLive() {
  const connected = useConnection()
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

  const visible = data?.media.filter(media => `${media.title} ${media.episodeTitle || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const youtubeMedia = visible?.filter(media => media.source.toLowerCase() !== "stremio")
  const stremioMedia = visible?.filter(media => media.source.toLowerCase() === "stremio")
  const renderMediaCard = (media: Media) => <button key={media.id} onClick={() => window.location.assign(`/watch/${media.id}`)} className={view === "grid" ? "group grid w-full min-w-0 grid-rows-[auto_1fr] content-start overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/30" : "group flex w-full items-center gap-4 py-5 text-left"}>
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
    {active && <button onClick={() => window.location.assign(`/watch/${active.id}`)} className="mt-8 flex w-full items-center gap-4 rounded-2xl bg-primary/10 p-5 text-left transition-colors hover:bg-primary/15"><span className="relative flex size-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" /><span className="relative size-3 rounded-full bg-primary" /></span><span className="min-w-0 flex-1"><span className="text-xs font-semibold text-primary">LIVE NOW</span><span className="mt-1 block truncate font-medium">{active.title}</span></span><ChevronRight className="size-5 shrink-0" /></button>}
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





