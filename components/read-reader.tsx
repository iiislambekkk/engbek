"use client"

import { createPortal } from "react-dom"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeft, Battery, ChevronUp, Minus, Moon, Plus, Sun } from "lucide-react"
import ePub from "epubjs"
import type Rendition from "epubjs/types/rendition"
import { Button } from "@/components/ui/button"
import { SelectionMenu } from "@/components/selection-menu"
import { TranslationHistoryDrawer, type TranslationHistoryEntry } from "@/components/translation-history-drawer"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

type Mark = { id: string; text: string; locationAnchor: string | null }
type ReadDocument = { id: string; title: string; author: string|null; description: string|null; publisher: string|null; publishedDate: string|null; isbn: string|null; language: string|null; positionCfi: string | null; progress: number }
type Location = { start: { cfi: string; percentage: number; displayed: { page: number; total: number }; href?: string; index?: number } }
type EpubLocations = { length: () => number; locationFromCfi: (cfi: string) => number }
type EpubSpine = { spineItems?: Array<{ href: string; linear?: string }> }
type BatteryManager = EventTarget & { level: number; charging: boolean }
type EpubContents = { window: Window; document: Document; range: (cfi: string) => Range }
type ReaderTheme = "light" | "sepia" | "dark"
type TextAlignment = "left" | "center" | "right" | "justify"
type StatusItem = "battery" | "pages" | "time"
const readerThemes: Record<ReaderTheme, { background: string; color: string }> = {
  light: { background: "#ffffff", color: "#242424" },
  sepia: { background: "#f4ecd8", color: "#433422" },
  dark: { background: "#1c1b19", color: "#e5e1d8" },
}
const themeUiColors: Record<ReaderTheme, { chrome: string; accent: string; border: string }> = {
  light: { chrome: "#f3f4f6", accent: "#71717a", border: "#d4d4d8" },
  sepia: { chrome: "#e8dcc2", accent: "#8b6b3e", border: "#cbb994" },
  dark: { chrome: "#1c1b19", accent: "#a8a29e", border: "#44403c" },
}
const progressColorOptions = ["#71717a", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"]
const readerPreferencesKey = "read-reader-preferences:v1"
function loadReaderPreferences() {
  const defaults = { fontSize: 20, readerTheme: "light" as ReaderTheme, topPadding: 24, bottomPadding: 24, progressColor: "", customBackground: "", panelBackground: "", textAlignment: "justify" as TextAlignment, statusItems: ["battery", "pages"] as StatusItem[], readerFont: "Georgia", fontColor: "", fontWeight: 400, firstLineIndent: 2, horizontalSpacing: 1, verticalSpacing: 2, lineHeight: 1.8, letterSpacing: 0 }
  if (typeof window === "undefined") return defaults
  try {
    const stored = JSON.parse(window.localStorage.getItem(readerPreferencesKey) || "null")
    return {
      fontSize: typeof stored?.fontSize === "number" && stored.fontSize >= 14 && stored.fontSize <= 32 ? stored.fontSize : defaults.fontSize,
      readerTheme: typeof stored?.readerTheme === "string" && stored.readerTheme in readerThemes ? stored.readerTheme as ReaderTheme : defaults.readerTheme,
      topPadding: typeof stored?.topPadding === "number" && stored.topPadding >= 0 && stored.topPadding <= 160 ? stored.topPadding : defaults.topPadding,
      bottomPadding: typeof stored?.bottomPadding === "number" && stored.bottomPadding >= 0 && stored.bottomPadding <= 160 ? stored.bottomPadding : defaults.bottomPadding,
      progressColor: typeof stored?.progressColor === "string" && /^#[\da-f]{6}$/i.test(stored.progressColor) ? stored.progressColor : defaults.progressColor,
      customBackground: typeof stored?.customBackground === "string" && /^#[\da-f]{6}$/i.test(stored.customBackground) ? stored.customBackground : defaults.customBackground,
      panelBackground: typeof stored?.panelBackground === "string" && /^#[\da-f]{6}$/i.test(stored.panelBackground) ? stored.panelBackground : defaults.panelBackground,
      textAlignment: ["left", "center", "right", "justify"].includes(stored?.textAlignment) ? stored.textAlignment as TextAlignment : defaults.textAlignment,
      statusItems: Array.isArray(stored?.statusItems) ? defaults.statusItems.filter(item => stored.statusItems.includes(item)) : defaults.statusItems,
      readerFont: typeof stored?.readerFont === "string" && ["Georgia", "Arial", "Merriweather", "Times New Roman", "Verdana"].includes(stored.readerFont) ? stored.readerFont : defaults.readerFont,
      fontColor: typeof stored?.fontColor === "string" && /^#[\da-f]{6}$/i.test(stored.fontColor) ? stored.fontColor : defaults.fontColor,
      fontWeight: typeof stored?.fontWeight === "number" && stored.fontWeight >= 300 && stored.fontWeight <= 700 ? stored.fontWeight : defaults.fontWeight,
      firstLineIndent: typeof stored?.firstLineIndent === "number" && stored.firstLineIndent >= 0 && stored.firstLineIndent <= 8 ? stored.firstLineIndent : defaults.firstLineIndent,
      horizontalSpacing: typeof stored?.horizontalSpacing === "number" && stored.horizontalSpacing >= 0 && stored.horizontalSpacing <= 4 ? stored.horizontalSpacing : defaults.horizontalSpacing,
      verticalSpacing: typeof stored?.verticalSpacing === "number" && stored.verticalSpacing >= 0 && stored.verticalSpacing <= 8 ? stored.verticalSpacing : defaults.verticalSpacing,
      lineHeight: typeof stored?.lineHeight === "number" && stored.lineHeight >= 1 && stored.lineHeight <= 3 ? stored.lineHeight : defaults.lineHeight,
      letterSpacing: typeof stored?.letterSpacing === "number" && stored.letterSpacing >= 0 && stored.letterSpacing <= 4 ? stored.letterSpacing : defaults.letterSpacing,
    }
  } catch { return defaults }
}
const subscribeToPortal = () => () => {}
const getPortalSnapshot = () => window.document.body
const getServerPortalSnapshot = (): HTMLElement | null => null

export function ReadReader({ document, initialMarks }: { document: ReadDocument; initialMarks: Mark[] }) {
  const [preferences] = useState(loadReaderPreferences)
  const [fontSize, setFontSize] = useState(preferences.fontSize)
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(preferences.readerTheme)
  const [topPadding, setTopPadding] = useState(preferences.topPadding)
  const [bottomPadding, setBottomPadding] = useState(preferences.bottomPadding)
  const [progressColor, setProgressColor] = useState(preferences.progressColor)
  const [customBackground, setCustomBackground] = useState(preferences.customBackground)
  const [panelBackground, setPanelBackground] = useState(preferences.panelBackground)
  const [textAlignment, setTextAlignment] = useState<TextAlignment>(preferences.textAlignment)
  const [statusItems, setStatusItems] = useState<StatusItem[]>(preferences.statusItems)
  const [currentTime, setCurrentTime] = useState("")
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [fontSettingsOpen, setFontSettingsOpen] = useState(false)
  const [readerFont, setReaderFont] = useState(preferences.readerFont)
  const [fontColor, setFontColor] = useState(preferences.fontColor)
  const [fontWeight, setFontWeight] = useState(preferences.fontWeight)
  const [paragraphSettingsOpen, setParagraphSettingsOpen] = useState(false)
  const [firstLineIndent, setFirstLineIndent] = useState(preferences.firstLineIndent)
  const [horizontalSpacing, setHorizontalSpacing] = useState(preferences.horizontalSpacing)
  const [verticalSpacing, setVerticalSpacing] = useState(preferences.verticalSpacing)
  const [lineHeight, setLineHeight] = useState(preferences.lineHeight)
  const [letterSpacing, setLetterSpacing] = useState(preferences.letterSpacing)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const portalRoot = useSyncExternalStore(subscribeToPortal, getPortalSnapshot, getServerPortalSnapshot)
  const [progress, setProgress] = useState(document.progress)
  const [pages, setPages] = useState<{ chapter: number; chapterTotal: number; chapterRead: number; chapterPages: number; read: number; total: number } | null>(null)
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selection, setSelection] = useState<{ text: string; context: string; cfi: string; position: { top: number; left: number } } | null>(null)
  const [marks, setMarks] = useState(initialMarks)
  const [drawerEntry, setDrawerEntry] = useState<TranslationHistoryEntry | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const target = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const bookRef = useRef<ReturnType<typeof ePub> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!portalRoot) return
    const previousOverflow = window.document.body.style.overflow
    window.document.body.style.overflow = "hidden"
    return () => { window.document.body.style.overflow = previousOverflow }
  }, [portalRoot])

  useEffect(() => {
    const batteryNavigator = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
    if (!batteryNavigator.getBattery) return
    let battery: BatteryManager | null = null
    let active = true
    const update = () => { if (battery) setBatteryPercent(Math.round(battery.level * 100)) }
    void batteryNavigator.getBattery().then(result => {
      if (!active) return
      battery = result
      update()
      battery.addEventListener("levelchange", update)
    }).catch(() => setBatteryPercent(null))
    return () => {
      active = false
      battery?.removeEventListener("levelchange", update)
    }
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(readerPreferencesKey, JSON.stringify({ fontSize, readerTheme, topPadding, bottomPadding, progressColor, customBackground, panelBackground, textAlignment, statusItems, readerFont, fontColor, fontWeight, firstLineIndent, horizontalSpacing, verticalSpacing, lineHeight, letterSpacing })) } catch {}
  }, [fontSize, readerTheme, topPadding, bottomPadding, progressColor, customBackground, panelBackground, textAlignment, statusItems, readerFont, fontColor, fontWeight, firstLineIndent, horizontalSpacing, verticalSpacing, lineHeight, letterSpacing])

  useEffect(() => {
    const update = () => setCurrentTime(new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date()))
    update()
    const timer = setInterval(update, 30_000)
    return () => clearInterval(timer)
  }, [])

  const source = useMemo(() => ({ type: "READ", title: document.title, id: document.id, locationLabel: "EPUB", locationAnchor: selection?.cfi }), [document.id, document.title, selection])
  const uiColors = themeUiColors[readerTheme]
  const effectiveBackground = customBackground || readerThemes[readerTheme].background
  const effectivePanelBackground = panelBackground || uiColors.chrome
  const effectiveFontColor = fontColor || readerThemes[readerTheme].color
  const fontFamily = readerFont === "Merriweather" ? "Merriweather, Georgia, serif" : readerFont === "Arial" ? "Arial, sans-serif" : readerFont === "Times New Roman" ? "'Times New Roman', serif" : readerFont === "Verdana" ? "Verdana, sans-serif" : "Georgia, serif"
  const activeProgressColor = progressColor || uiColors.accent
  const toggleStatusItem = (item: StatusItem) => setStatusItems(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])

  const savePosition = useCallback((location: Location) => {
    const cfi = location.start?.cfi
    if (!cfi?.startsWith("epubcfi(")) return
    const spineItems = (bookRef.current?.spine as unknown as EpubSpine | undefined)?.spineItems?.filter(item => item.linear !== "no") || []
    const currentHref = location.start.href?.split("#")[0]
    const chapter = currentHref ? spineItems.findIndex(item => item.href.split("#")[0] === currentHref) : -1
    const locations = bookRef.current?.locations as unknown as EpubLocations | undefined
    const locationIndex = locations?.locationFromCfi(cfi) ?? -1
    const total = locations?.length() || 0
    const read = locationIndex >= 0 ? Math.min(total, locationIndex + 1) : 1
    const percent = total > 0 ? Math.max(0, Math.min(1, read / total)) : Math.max(0, Math.min(1, location.start.percentage || 0))
    setProgress(percent)
    setPages(current => ({
      chapter: chapter >= 0 ? chapter + 1 : current?.chapter ?? 1,
      chapterTotal: spineItems.length || current?.chapterTotal || 1,
      chapterRead: location.start.displayed.page,
      chapterPages: location.start.displayed.total,
      read,
      total,
    }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void fetch("/api/read", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: document.id, cfi, progress: percent }) }).catch(() => {})
    }, 600)
  }, [document.id])

  useEffect(() => {
    if (!portalRoot || !target.current) return
    let disposed = false
    let book: ReturnType<typeof ePub> | null = null
    let rendition: Rendition | null = null
    const removeReaderControls: Array<() => void> = []
    async function openBook() {
      try {
        const response = await fetch(`/api/read/${document.id}/file`, { cache: "no-store" })
        if (!response.ok) throw new Error("Could not load this EPUB.")
        const data = await response.arrayBuffer()
        if (disposed || !target.current) return
        book = ePub(data)
        bookRef.current = book
        rendition = book.renderTo(target.current, { width: "100%", height: "100%", flow: "paginated", spread: "none", manager: "default" })
        renditionRef.current = rendition
        const attachedDocuments = new WeakSet<Document>()
        const attachReaderControls = (readerDocument: Document) => {
          if (attachedDocuments.has(readerDocument)) return
          attachedDocuments.add(readerDocument)
          const navigate = (direction: "previous" | "next") => {
            if (direction === "previous") void rendition?.prev()
            else void rendition?.next()
          }
          const onKeyDown = (rawEvent: Event) => {
            const event = rawEvent as KeyboardEvent
            if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return
            if (event.key === "ArrowLeft") { event.preventDefault(); navigate("previous") }
            if (event.key === "ArrowRight") { event.preventDefault(); navigate("next") }
          }
          let touchStart: { x: number; y: number } | null = null
          let swiping = false
          const onTouchStart = (rawEvent: Event) => {
            const event = rawEvent as TouchEvent
            const touch = event.changedTouches[0]
            if (touch) {
              touchStart = { x: touch.clientX, y: touch.clientY }
              swiping = false
            }
          }
          const onTouchMove = (rawEvent: Event) => {
            const event = rawEvent as TouchEvent
            const touch = event.changedTouches[0]
            if (!touchStart || !touch) return
            const dx = touch.clientX - touchStart.x
            const dy = touch.clientY - touchStart.y
            if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) swiping = true
            if (swiping && event.cancelable) event.preventDefault()
          }
          const onTouchEnd = (rawEvent: Event) => {
            const event = rawEvent as TouchEvent
            if (!touchStart) return
            const touch = event.changedTouches[0]
            if (!touch) return
            const dx = touch.clientX - touchStart.x
            const dy = touch.clientY - touchStart.y
            if (swiping && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
              readerDocument.getSelection()?.removeAllRanges()
              navigate(dx > 0 ? "previous" : "next")
            }
            touchStart = null
            swiping = false
          }
          const onTouchCancel = () => { touchStart = null; swiping = false }
          readerDocument.addEventListener("keydown", onKeyDown)
          readerDocument.addEventListener("touchstart", onTouchStart, { passive: true, capture: true })
          readerDocument.addEventListener("touchmove", onTouchMove, { passive: false, capture: true })
          readerDocument.addEventListener("touchend", onTouchEnd, { passive: true })
          readerDocument.addEventListener("touchcancel", onTouchCancel)
          removeReaderControls.push(() => {
            readerDocument.removeEventListener("keydown", onKeyDown)
            readerDocument.removeEventListener("touchstart", onTouchStart, true)
            readerDocument.removeEventListener("touchmove", onTouchMove, true)
            readerDocument.removeEventListener("touchend", onTouchEnd)
            readerDocument.removeEventListener("touchcancel", onTouchCancel)
          })
        }
        rendition.on("rendered", (_section: unknown, contents: EpubContents) => attachReaderControls(contents.document))
        const onWindowKeyDown = (event: KeyboardEvent) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
          if (event.key === "ArrowLeft") { event.preventDefault(); void rendition?.prev() }
          if (event.key === "ArrowRight") { event.preventDefault(); void rendition?.next() }
        }
        window.addEventListener("keydown", onWindowKeyDown)
        removeReaderControls.push(() => window.removeEventListener("keydown", onWindowKeyDown))
        rendition.themes.fontSize(`${fontSize}px`)
        rendition.themes.default({ body: { "font-family": `${fontFamily} !important`, "font-weight": `${fontWeight} !important`, "line-height": `${lineHeight} !important`, "letter-spacing": `${letterSpacing}px !important`, "text-align": `${textAlignment} !important`, color: `${effectiveFontColor} !important`, "background-color": `${effectiveBackground} !important`, padding: `${topPadding}px ${horizontalSpacing}rem ${bottomPadding}px !important`, "box-sizing": "border-box !important" }, "p": { "text-indent": `${firstLineIndent}em !important`, "margin-block-start": "0 !important", "margin-block-end": `${verticalSpacing}em !important` }, "::selection": { background: "rgba(250, 204, 21, .45)" } })
        rendition.on("relocated", (location: Location) => savePosition(location))
        rendition.on("selected", (cfiRange: string, contents: EpubContents) => {
          const selected = contents.window.getSelection()?.toString().trim()
          if (!selected) return
          const range = contents.range(cfiRange)
          const rect = range.getBoundingClientRect()
          const frame = contents.document.defaultView?.frameElement
          const frameRect = frame?.getBoundingClientRect()
          const node = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer as HTMLElement
          const paragraph = node?.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6")
          const context = (paragraph?.textContent || node?.parentElement?.textContent || selected).trim().slice(0, 10000)
          setSelection({ text: selected, context, cfi: cfiRange, position: { top: Math.max(12, Math.min(window.innerHeight - 190, (frameRect?.top || 0) + rect.bottom + 8)), left: Math.max(12, Math.min(window.innerWidth - 380, (frameRect?.left || 0) + rect.left)) } })
        })
        await rendition.display(document.positionCfi || undefined)
        if (disposed) return
        for (const mark of marks) if (mark.locationAnchor?.startsWith("epubcfi(")) rendition.annotations.highlight(mark.locationAnchor, { text: mark.text }, undefined, "read-saved-highlight", { fill: "rgba(250, 204, 21, .45)", "fill-opacity": "0.55", "mix-blend-mode": "multiply" })
        await book.locations.generate(900)
        if (disposed || !rendition) return
        const location = await rendition.currentLocation()
        if (location) savePosition(location as unknown as Location)
        setLoading(false)
      } catch (cause) {
        if (!disposed) { setError(cause instanceof Error ? cause.message : "Could not open this EPUB."); setLoading(false) }
      }
    }
    void openBook()
    return () => {
      disposed = true
      removeReaderControls.forEach(remove => remove())
      if (saveTimer.current) clearTimeout(saveTimer.current)
      rendition?.destroy()
      book?.destroy()
      renditionRef.current = null
      bookRef.current = null
    }
  // epubjs owns the rendering lifecycle; initialize once per selected book.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id, document.positionCfi, portalRoot])

  useEffect(() => { renditionRef.current?.themes.fontSize(`${fontSize}px`) }, [fontSize])
  useEffect(() => {
    renditionRef.current?.themes.default({ body: { "font-family": `${fontFamily} !important`, "font-weight": `${fontWeight} !important`, "line-height": `${lineHeight} !important`, "letter-spacing": `${letterSpacing}px !important`, "text-align": `${textAlignment} !important`, color: `${effectiveFontColor} !important`, "background-color": `${effectiveBackground} !important`, padding: `${topPadding}px ${horizontalSpacing}rem ${bottomPadding}px !important`, "box-sizing": "border-box !important" }, "p": { "text-indent": `${firstLineIndent}em !important`, "margin-block-start": "0 !important", "margin-block-end": `${verticalSpacing}em !important` } })
  }, [topPadding, bottomPadding, textAlignment, effectiveBackground, effectiveFontColor, fontFamily, fontWeight, verticalSpacing, horizontalSpacing, lineHeight, letterSpacing, firstLineIndent])

  function addHighlight(text: string) {
    if (!selection || !renditionRef.current) return
    renditionRef.current.annotations.highlight(selection.cfi, { text }, undefined, "read-saved-highlight", { fill: "rgba(250, 204, 21, .45)", "fill-opacity": "0.55", "mix-blend-mode": "multiply" })
    void fetch("/api/learning-history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "EXPRESSION", text, context: selection.context, source }) }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not save highlight.")
      setMarks(current => [...current, { id: body.item.id, text, locationAnchor: selection.cfi }])
      setError("")
    }).catch(cause => setError(cause instanceof Error ? cause.message : "Could not save highlight."))
    setSelection(null)
  }

  async function translate(text: string) {
    if (!selection) return
    setDrawerLoading(true)
    try {
      const markedResponse = await fetch("/api/learning-history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "EXPRESSION", text, context: selection.context, source }) })
      const marked = await markedResponse.json()
      if (!markedResponse.ok) throw new Error(marked.error || "Could not save selected text.")
      const response = await fetch("/api/learning-history/translations/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ markedItemId: marked.item.id }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not translate the selection.")
      setDrawerEntry(body.entry)
      setSelection(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not translate the selection.") }
    finally { setDrawerLoading(false) }
  }

  if (!portalRoot) return null
  return createPortal(<>
    <div className="fixed inset-0 z-[100] flex h-dvh w-screen flex-col overflow-hidden bg-background">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-2" style={{ backgroundColor: uiColors.chrome, color: readerThemes[readerTheme].color, borderColor: uiColors.border }}>
        <Link href="/read" aria-label="Back to library" className="grid size-7 shrink-0 place-items-center rounded opacity-70 hover:bg-black/10"><ArrowLeft className="size-4"/></Link>
        <h1 className="min-w-0 flex-1 truncate text-xs font-medium">{document.title}</h1>
        <span className="shrink-0 text-[11px] tabular-nums opacity-70">{Math.round(progress*100)}%</span>
      </header>
      <div className="h-1 shrink-0" style={{ backgroundColor: uiColors.border }}><div className="h-full transition-all" style={{width:`${Math.round(progress*100)}%`, backgroundColor: activeProgressColor}}/></div>
      {error&&<p role="alert" className="shrink-0 px-4 py-2 text-sm text-destructive">{error}</p>}
      <main className="relative min-h-0 flex-1 overflow-hidden" style={{ backgroundColor: effectiveBackground }}>
        <div ref={target} className="h-full w-full" style={{ backgroundColor: effectiveBackground }}/>
        {loading&&<p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground" style={{ backgroundColor: effectiveBackground }}>Opening EPUB…</p>}
      </main>
      <footer className="grid min-h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t px-3 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]" style={{ backgroundColor: effectivePanelBackground, color: readerThemes[readerTheme].color, borderColor: uiColors.border }}>
        <div className="flex items-center gap-2 text-[11px] tabular-nums opacity-70">
          {statusItems.includes("battery")&&<span className="flex items-center gap-1" aria-label={`Battery ${batteryPercent === null ? "unavailable" : `${batteryPercent}%`}`}><Battery className="size-4"/>{batteryPercent === null ? "—" : `${batteryPercent}%`}</span>}
          {statusItems.includes("time")&&<span>{currentTime}</span>}
        </div>
        <div className="text-center leading-tight">
          {statusItems.includes("pages")&&<div className="text-[12px] font-medium tabular-nums">{pages ? <><span className="block text-[10px] uppercase tracking-wider opacity-65">Глава {pages.chapter} — {pages.chapterRead} / {pages.chapterPages}</span><span className="block">{pages.read} / {pages.total} ({Math.round(progress * 100)}%)</span></> : `${Math.round(progress * 100)}%`}</div>}
        </div>
        <button type="button" onClick={()=>setSettingsOpen(true)} className="ml-auto flex h-9 items-center gap-1 rounded-md px-2 text-[10px] font-medium uppercase tracking-wider opacity-70 hover:bg-black/10" aria-label="Open reader menu"><span>Меню</span><ChevronUp className="size-3.5"/></button>
      </footer>
      {selection&&<SelectionMenu text={selection.text} position={selection.position} vocabulary={{term:selection.text,context:selection.context,source:{title:document.title,id:`read:${document.id}:${selection.cfi}`}}} onTranslate={text=>void translate(text)} onHighlight={addHighlight} onCopy={text=>{void navigator.clipboard.writeText(text);setSelection(null)}} onClose={()=>setSelection(null)}/>}
    </div>
    <Drawer open={settingsOpen} onOpenChange={setSettingsOpen} swipeDirection="down" showSwipeHandle overlayClassName="z-[110]" viewportClassName="z-[120]">
      <DrawerContent className="z-[120] max-h-[85dvh] rounded-t-3xl rounded-b-none border-white/10 bg-[#18191b] text-zinc-100 shadow-[0_-20px_60px_rgba(0,0,0,0.35)]">
        <DrawerHeader className="sr-only"><DrawerTitle>Меню ридера</DrawerTitle><DrawerDescription>Настройки чтения книги {document.title}</DrawerDescription></DrawerHeader>
        <div className="space-y-5 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-4 border-b border-white/10 pb-4">
            <div className="min-w-0 flex-1"><p className="truncate text-base font-semibold">{document.title}</p><p className="mt-1 truncate text-sm text-zinc-400">{document.author || "EPUB"}</p></div>
            <Button variant="secondary" className="shrink-0" nativeButton={false} render={<Link href="/read"/>}><ArrowLeft/>Закрыть книгу</Button>
          </div>
          <Drawer open={appearanceOpen} onOpenChange={setAppearanceOpen} swipeDirection="down" overlayClassName="z-[130]" viewportClassName="z-[140]">
          <section className="overflow-hidden rounded-xl border border-white/10">
            <button type="button" onClick={()=>setAppearanceOpen(true)} className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold uppercase tracking-wide text-zinc-200">Настройки внешнего вида<ChevronUp className="size-4 rotate-90"/></button>
            <DrawerContent className="z-[140] max-h-[85dvh] rounded-t-3xl rounded-b-none border-white/10 bg-[#18191b] text-zinc-100 shadow-[0_-20px_60px_rgba(0,0,0,0.35)]"><div className="space-y-5 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Фон и тема</h2>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={()=>setReaderTheme("light")} aria-pressed={readerTheme==="light"} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-xs font-medium transition ${readerTheme==="light"?"border-emerald-400 bg-emerald-500/15 text-white":"border-white/5 bg-white/[0.06] text-zinc-400 hover:bg-white/10"}`}><Sun className="size-5"/>Светлая</button>
              <button type="button" onClick={()=>setReaderTheme("sepia")} aria-pressed={readerTheme==="sepia"} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-xs font-medium transition ${readerTheme==="sepia"?"border-emerald-400 bg-emerald-500/15 text-white":"border-white/5 bg-white/[0.06] text-zinc-400 hover:bg-white/10"}`}><span className="size-5 rounded-full border border-[#d9c8a6] bg-[#f4ecd8]"/>Сепия</button>
              <button type="button" onClick={()=>setReaderTheme("dark")} aria-pressed={readerTheme==="dark"} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-xs font-medium transition ${readerTheme==="dark"?"border-emerald-400 bg-emerald-500/15 text-white":"border-white/5 bg-white/[0.06] text-zinc-400 hover:bg-white/10"}`}><Moon className="size-5"/>Тёмная</button>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-3"><label htmlFor="reader-background-color" className="text-sm text-zinc-300">Фон</label><div className="flex items-center gap-2"><span className="text-xs text-zinc-500">Тема</span><input id="reader-background-color" type="color" aria-label="Цвет фона книги" value={customBackground||readerThemes[readerTheme].background} onChange={event=>setCustomBackground(event.target.value)} className="size-8 cursor-pointer rounded-full border-0 bg-transparent"/><button type="button" onClick={()=>setCustomBackground("")} className="text-xs text-zinc-400 hover:text-white">Сбросить</button></div></div>
            <div className="flex items-center justify-between border-t border-white/10 pt-3"><label htmlFor="reader-panel-color" className="text-sm text-zinc-300">Фон панели перевода и меню</label><div className="flex items-center gap-2"><span className="text-xs text-zinc-500">Тема</span><input id="reader-panel-color" type="color" aria-label="Цвет фона панели" value={panelBackground||uiColors.chrome} onChange={event=>setPanelBackground(event.target.value)} className="size-8 cursor-pointer rounded-full border-0 bg-transparent"/><button type="button" onClick={()=>setPanelBackground("")} className="text-xs text-zinc-400 hover:text-white">Сбросить</button></div></div>
            </div>
            <div className="space-y-3"><h2 className="text-sm text-zinc-400">Выравнивание текста</h2><div className="flex gap-2">{([{value:"left",label:"По левому краю",Icon:AlignLeft},{value:"center",label:"По центру",Icon:AlignCenter},{value:"right",label:"По правому краю",Icon:AlignRight},{value:"justify",label:"По ширине",Icon:AlignJustify}] as const).map(({value,label,Icon})=><button key={value} type="button" aria-label={label} aria-pressed={textAlignment===value} onClick={()=>setTextAlignment(value)} className={`grid size-11 place-items-center rounded-xl ${textAlignment===value?"bg-emerald-500 text-white":"bg-white/10 text-zinc-400 hover:bg-white/15"}`}><Icon className="size-5"/></button>)}</div></div>
            <div className="space-y-3"><h2 className="text-sm text-zinc-400">Отображение элементов строки состояния</h2><div className="flex flex-wrap gap-2">{([{value:"battery",label:"Батарея"},{value:"pages",label:"Страницы"},{value:"time",label:"Время"}] as const).map(({value,label})=><button key={value} type="button" aria-pressed={statusItems.includes(value)} onClick={()=>toggleStatusItem(value)} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${statusItems.includes(value)?"bg-emerald-500 text-white":"bg-white/10 text-zinc-400 hover:bg-white/15"}`}>{label}</button>)}</div></div>
            <div className="space-y-3 border-t border-white/10 pt-4"><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Цвет индикатора прогресса</h2><div className="flex flex-wrap items-center gap-3">{progressColorOptions.map(color=><button key={color} type="button" aria-label={`Выбрать цвет ${color}`} aria-pressed={progressColor===color} onClick={()=>setProgressColor(color)} className={`size-8 rounded-full border-2 ${progressColor===color?"border-white ring-2 ring-emerald-400":"border-white/20"}`} style={{backgroundColor:color}}/>)}<label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-white/20 bg-white text-xs font-semibold text-zinc-700"><span>+</span><input type="color" value={progressColor||activeProgressColor} onChange={event=>setProgressColor(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Свой цвет прогресса"/></label><button type="button" onClick={()=>setProgressColor("")} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400">Цвет темы</button></div></div>
            </div></DrawerContent>
          </section>
          </Drawer>
          <Drawer open={fontSettingsOpen} onOpenChange={setFontSettingsOpen} swipeDirection="down" overlayClassName="z-[130]" viewportClassName="z-[140]">
          <section className="overflow-hidden rounded-xl border border-white/10">
            <button type="button" onClick={()=>setFontSettingsOpen(true)} className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold uppercase tracking-wide text-zinc-200">Настройки шрифта<ChevronUp className="size-4 rotate-90"/></button>
            <DrawerContent className="z-[140] max-h-[85dvh] rounded-t-3xl rounded-b-none border-white/10 bg-[#18191b] text-zinc-100 shadow-[0_-20px_60px_rgba(0,0,0,0.35)]"><div className="space-y-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between gap-3"><label htmlFor="reader-font-size" className="text-sm text-zinc-300">Размер шрифта</label><div className="flex items-center gap-2"><Button variant="secondary" size="icon" aria-label="Уменьшить шрифт" disabled={fontSize<=14} onClick={()=>setFontSize((size: number)=>Math.max(14,size-2))}><Minus/></Button><span className="min-w-7 text-center tabular-nums">{fontSize}</span><Button variant="secondary" size="icon" aria-label="Увеличить шрифт" disabled={fontSize>=32} onClick={()=>setFontSize((size: number)=>Math.min(32,size+2))}><Plus/></Button></div></div>
              <label className="flex items-center justify-between border-t border-white/10 pt-3 text-sm text-zinc-300">Шрифт<select value={readerFont} onChange={event=>setReaderFont(event.target.value)} className="max-w-48 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right text-sm text-zinc-200"><option value="Georgia">Georgia</option><option value="Merriweather">Merriweather</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Verdana">Verdana</option></select></label>
              <label className="flex items-center justify-between border-t border-white/10 pt-3 text-sm text-zinc-300">Цвет шрифта<span className="flex items-center gap-2"><span className="text-xs text-zinc-500">Тема</span><input type="color" aria-label="Цвет шрифта" value={effectiveFontColor} onChange={event=>setFontColor(event.target.value)} className="size-8 cursor-pointer rounded-full border-0 bg-transparent"/><button type="button" onClick={()=>setFontColor("")} className="text-xs text-zinc-400">Сбросить</button></span></label>
              <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm text-zinc-300"><span>Толщина шрифта</span><div className="flex items-center gap-2"><Button variant="secondary" size="icon" aria-label="Уменьшить толщину" disabled={fontWeight<=300} onClick={()=>setFontWeight((value: number)=>Math.max(300,value-100))}><Minus/></Button><span className="min-w-8 text-center tabular-nums">{fontWeight}</span><Button variant="secondary" size="icon" aria-label="Увеличить толщину" disabled={fontWeight>=700} onClick={()=>setFontWeight((value: number)=>Math.min(700,value+100))}><Plus/></Button></div></div>
            </div></DrawerContent>
          </section>
          </Drawer>
          <Drawer open={paragraphSettingsOpen} onOpenChange={setParagraphSettingsOpen} swipeDirection="down" overlayClassName="z-[130]" viewportClassName="z-[140]">
          <section className="overflow-hidden rounded-xl border border-white/10">
            <button type="button" onClick={()=>setParagraphSettingsOpen(true)} className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold uppercase tracking-wide text-zinc-200">Настройки параграфа<ChevronUp className="size-4 rotate-90"/></button>
            <DrawerContent className="z-[140] max-h-[85dvh] rounded-t-3xl rounded-b-none border-white/10 bg-[#18191b] text-zinc-100 shadow-[0_-20px_60px_rgba(0,0,0,0.35)]"><div className="divide-y divide-white/10 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {([
                { label: "Отступ первой строки", value: firstLineIndent, min: 0, max: 8, step: 1, set: setFirstLineIndent },
                { label: "Отступы по горизонтали", value: horizontalSpacing, min: 0, max: 4, step: 0.5, set: setHorizontalSpacing },
                { label: "Отступы по вертикали", value: verticalSpacing, min: 0, max: 8, step: 0.5, set: setVerticalSpacing },
                { label: "Межстрочный интервал", value: lineHeight, min: 1, max: 3, step: 0.1, set: setLineHeight },
                { label: "Межбуквенный интервал", value: letterSpacing, min: 0, max: 4, step: 0.1, set: setLetterSpacing },
                { label: "Отступ сверху", value: topPadding, min: 0, max: 160, step: 8, set: setTopPadding },
                { label: "Отступ снизу", value: bottomPadding, min: 0, max: 160, step: 8, set: setBottomPadding },
              ] as const).map(({label,value,min,max,step,set})=><div key={label} className="flex min-h-[58px] items-center justify-between gap-3 py-2"><span className="min-w-0 text-sm text-zinc-300">{label}</span><div className="flex shrink-0 items-center gap-2"><Button variant="secondary" size="icon" aria-label={`Уменьшить: ${label}`} disabled={value<=min} onClick={()=>set((current: number)=>Math.max(min,Math.round((current-step)*100)/100))}><Minus/></Button><span className="min-w-8 text-center tabular-nums">{value}</span><Button variant="secondary" size="icon" aria-label={`Увеличить: ${label}`} disabled={value>=max} onClick={()=>set((current: number)=>Math.min(max,Math.round((current+step)*100)/100))}><Plus/></Button></div></div>)}
            </div></DrawerContent>
          </section>
          </Drawer>
          {(document.publisher||document.description)&&<details className="border-t border-white/10 pt-4 text-sm"><summary className="cursor-pointer font-medium text-zinc-300">О книге</summary><div className="mt-3 space-y-2 text-zinc-400">{document.publisher&&<p>{document.publisher}{document.publishedDate?` · ${document.publishedDate}`:""}</p>}{document.description&&<p className="whitespace-pre-line leading-6">{document.description.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()}</p>}</div></details>}
        </div>
      </DrawerContent>
    </Drawer>
    <TranslationHistoryDrawer entry={drawerEntry} loading={drawerLoading} requestError="" overlayClassName="z-[110]" viewportClassName="z-[120]" contentClassName="z-[120]" onOpenChange={open=>{if(!open)setDrawerEntry(null)}}/>
  </>, portalRoot)
}
