"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, BookOpenText, ChevronDown, Lightbulb, LoaderCircle, MessageCircleWarning, Send, Trash2, Volume2, Eraser, Clapperboard, X } from "lucide-react"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { GrammarData } from "@/lib/vocabulary/types"
import type { VocabularyChatMessage } from "@/lib/vocabulary/chat"
import { Badge } from "@/components/ui/badge"
import {Button, buttonVariants} from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogTrigger,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type Item = {
    id: string
    term: string
    type: string
    phonetic: string | null
    pronunciation: string | null
    familiarity: "NEW" | "LEARNING" | "FAMILIAR" | "MASTERED"
    createdAt: Date
    updatedAt: Date
    notes: string | null
    grammar: GrammarData | null
    chat: { messages: VocabularyChatMessage[] } | null
    meanings: {
        id: string
        definition: string
        translation: string | null
        partOfSpeech: string | null
        examples: { id: string; text: string; sourceTitle: string | null; sourceUrl: string | null }[]
    }[]
    tags: { tag: { name: string } }[]
}

type UsageNotes = {
    nuance: string[]
    register: string[]
    patterns: string[]
    examples: string[]
    other: string[]
}

function parseUsageNotes(notes: string | null): UsageNotes {
    const parsed: UsageNotes = { nuance: [], register: [], patterns: [], examples: [], other: [] }
    if (!notes?.trim()) return parsed

    let section: keyof UsageNotes | null = null
    for (const rawLine of notes.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) continue
        const heading = line.match(/^(Nuance|Register|Common patterns|Examples):\s*(.*)$/i)
        if (heading) {
            section = heading[1].toLowerCase() === "nuance"
                ? "nuance"
                : heading[1].toLowerCase() === "register" ? "register" : heading[1].toLowerCase() === "examples" ? "examples" : "patterns"
            if (heading[2]) parsed[section].push(heading[2])
            continue
        }
        const content = line.replace(/^(?:[-*]|\d+[.)])\s*/, "")
        if (section) parsed[section].push(content)
        else parsed.other.push(content)
    }
    return parsed
}

const labels: Record<Item["familiarity"], string> = {
    NEW: "New", LEARNING: "Learning", FAMILIAR: "Familiar", MASTERED: "Mastered",
}
const familiarityStyles: Record<Item["familiarity"], string> = {
    NEW: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
    LEARNING: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
    FAMILIAR: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
    MASTERED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
}
const typeLabels: Record<string, string> = {
    WORD: "Word", PHRASE: "Phrase", PHRASAL_VERB: "Phrasal verb", COLLOCATION: "Collocation", IDIOM: "Idiom",
}

export function VocabularyWordPage({ item: initialItem }: { item: Item }) {
    const [item, setItem] = useState(initialItem)
    const usage = parseUsageNotes(item.notes)
    const [activeSection, setActiveSection] = useState("meanings")
    const [activeTense, setActiveTense] = useState<"past" | "present" | "future">("present")
    const [question, setQuestion] = useState("")
    const [chatBusy, setChatBusy] = useState(false)
    const [clearChatBusy, setClearChatBusy] = useState(false)
    const [chatError, setChatError] = useState("")
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [deleteError, setDeleteError] = useState("")
    const router = useRouter()

    const update = async (familiarity: Item["familiarity"]) => {
        const response = await fetch(`/api/vocabulary/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ familiarity }),
        })
        if (response.ok) {
            setItem(current => ({ ...current, familiarity }))
            router.refresh()
        }
    }

    const speak = () => {
        if (!("speechSynthesis" in window)) return
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(item.term))
    }

    const remove = async () => {
        if (deleteBusy) return
        setDeleteBusy(true)
        setDeleteError("")
        try {
            const response = await fetch(`/api/vocabulary/${item.id}`, { method: "DELETE" })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not delete this word.")
            router.push("/")
            router.refresh()
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : "Could not delete this word.")
        } finally {
            setDeleteBusy(false)
        }
    }

    const ask = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!question.trim() || chatBusy) return
        setChatBusy(true)
        setChatError("")
        try {
            const response = await fetch(`/api/vocabulary/${item.id}/chat`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }),
            })
            const result = await response.json().catch(() => null)
            if (!response.ok) throw new Error(result?.error || `Could not get an answer (HTTP ${response.status}).`)
            if (!result) throw new Error("The assistant returned an empty response. Please try again.")
            setItem(current => ({
                ...current,
                chat: { messages: result.messages },
                meanings: result.meanings ?? current.meanings,
                notes: result.notes ?? current.notes,
                grammar: (result.grammar as GrammarData | null | undefined) ?? current.grammar,
                term: result.term ?? current.term,
                phonetic: result.phonetic ?? current.phonetic,
                pronunciation: result.pronunciation ?? current.pronunciation,
            }))
            setQuestion("")
        } catch (error) {
            setChatError(error instanceof Error ? error.message : "Could not get an answer.")
        } finally {
            setChatBusy(false)
        }
    }

    const clearChat = async () => {
        if (clearChatBusy || chatBusy || !item.chat?.messages.length) return
        setClearChatBusy(true)
        setChatError("")
        try {
            const response = await fetch(`/api/vocabulary/${item.id}/chat`, { method: "DELETE" })
            const result = await response.json().catch(() => null)
            if (!response.ok) throw new Error(result?.error || `Could not clear chat (HTTP ${response.status}).`)
            setItem(current => ({ ...current, chat: { messages: [] } }))
        } catch (error) {
            setChatError(error instanceof Error ? error.message : "Could not clear chat.")
        } finally {
            setClearChatBusy(false)
        }
    }

    return (
        <div className="mx-auto max-w-6xl space-y-3 pb-3">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft className="size-3.5" /> Vocabulary
            </Link>

            <header className="relative overflow-hidden rounded-xl border bg-card px-4 py-3 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary/70 sm:px-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="px-2 py-0 text-[10px]">{typeLabels[item.type] ?? item.type}</Badge>
                            {item.tags.map(({ tag }) => <Badge variant="outline" className="px-2 py-0 text-[10px]" key={tag.name}>{tag.name}</Badge>)}
                        </div>
                        <div>
                            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{item.term}</h1>
                            <p className="text-sm text-muted-foreground">{item.phonetic || "Pronunciation not added"}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                        <Button variant="outline" size="icon" className="size-8" onClick={speak} aria-label="Pronounce word"><Volume2 className="size-4" /></Button>
                        <AlertDialog>
                            <Button variant="destructive" size="icon" className="size-8" disabled={deleteBusy} aria-label="Remove from Vocabulary" title="Remove from Vocabulary" render={<AlertDialogTrigger />}>
                                {deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                            </Button>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this word?</AlertDialogTitle>
                                    <AlertDialogDescription>This will permanently delete “{item.term}” from your vocabulary.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">Delete word</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-medium">Learning progress</p>
                    <Select value={item.familiarity} onValueChange={value => value && void update(value as Item["familiarity"])}>
                        <SelectTrigger className={cn("h-8 w-full text-xs sm:w-40", familiarityStyles[item.familiarity])}><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <YouGlishExample query={item.term} />
            </header>

            <Tabs value={activeSection} onValueChange={value => value && setActiveSection(value)} className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg border bg-muted/70 p-0.5 lg:w-[24rem]">
                    <TabsTrigger value="meanings" className="h-full rounded-md py-0 text-xs data-active:bg-background data-active:text-primary data-active:shadow-sm">Meanings</TabsTrigger>
                    <TabsTrigger value="grammar" className="h-full rounded-md py-0 text-xs data-active:bg-background data-active:text-primary data-active:shadow-sm">Grammar</TabsTrigger>
                    <TabsTrigger value="chat" className="h-full rounded-md py-0 text-xs data-active:bg-background data-active:text-primary data-active:shadow-sm">Ask AI</TabsTrigger>
                </TabsList>
            </div>
            <div className={cn("block")}>
                <div className="min-w-0">
                    <TabsContent value="meanings" className="space-y-2">
                    {!!(usage.nuance.length || usage.register.length || usage.patterns.length || usage.examples.length || usage.other.length) && <UsageGuide usage={usage} />}
                    {item.meanings.map((meaning, index) => <Collapsible key={meaning.id}>
                        <Card className="overflow-hidden border-border bg-card shadow-sm">
                            <CollapsibleTrigger className="group w-full text-left">
                                <CardHeader className="flex flex-row items-center justify-between gap-3 bg-muted/35 px-3 py-2.5 transition-colors hover:bg-muted/60 sm:px-4">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Meaning {index + 1}{meaning.partOfSpeech ? ` (${meaning.partOfSpeech.toLowerCase().replaceAll("_", " ")})` : ""}</p>
                                        <p className="mt-0.5 truncate text-sm font-semibold">{meaning.translation || meaning.definition}</p>
                                    </div>
                                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
                                </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <CardContent className="space-y-2.5 border-t p-3 sm:p-4">
                                    {meaning.translation && <p className="text-xs leading-5">{meaning.definition}</p>}
                                    <div className="space-y-2">
                                    {meaning.examples.map(example => <article key={example.id} className="rounded-md border bg-muted/20 p-2.5"><blockquote className="border-l-2 border-primary/50 pl-2 text-xs leading-5 italic">{example.text}</blockquote></article>)}
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>)}
                    </TabsContent>

                    <TabsContent value="grammar" className="space-y-6">
                    {item.grammar && <section className="space-y-5 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/5 sm:p-6">
                        <div><h2 className="text-lg font-semibold tracking-tight">Forms and grammar</h2><p className="mt-1 text-sm text-muted-foreground">Explore how this word changes and works in context.</p></div>
                        {item.grammar.verbTenses.length > 0 && <>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-4"><h3 className="text-sm font-medium">Verb conjugation</h3><div className="flex gap-1 rounded-full bg-muted/70 p-1">{item.grammar.verbTenses.map(tense => <button key={tense.key} type="button" onClick={() => setActiveTense(tense.key)} className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors", activeTense === tense.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{tense.key}</button>)}</div></div>
                                <div className="divide-y divide-border/50">{item.grammar.verbTenses.find(tense => tense.key === activeTense)?.aspects.map(aspect => <article key={`${activeTense}-${aspect.name}`} className="grid gap-2 py-3 first:pt-2 sm:grid-cols-[minmax(10rem,0.8fr)_1.2fr] sm:gap-6"><div><h4 className="text-sm font-medium">{aspect.name}</h4><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{aspect.description}</p>{aspect.clues.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Often with {aspect.clues.join(", ")}</p>}</div><div className="self-center"><p className="text-base font-semibold tracking-tight">{aspect.form}</p><div className="relative mt-3 h-4"><div className="absolute inset-x-0 top-1.5 h-px bg-muted-foreground/20"/><div className="absolute top-1 h-1.5 rounded-full bg-primary/60" style={{ left: `${aspect.timelineStart}%`, width: `${Math.max(aspect.timelineEnd - aspect.timelineStart, 2)}%` }}/><span className="absolute left-1/2 top-2.5 -translate-x-1/2 text-[9px] text-muted-foreground">now</span></div></div></article>)}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl bg-muted/40 px-4 py-3 text-sm sm:grid-cols-5">{[["Base", item.grammar.verbForms.base], ["3rd person", item.grammar.verbForms.thirdPerson], ["Past", item.grammar.verbForms.past], ["Past participle", item.grammar.verbForms.pastParticiple], ["-ing", item.grammar.verbForms.ing]].filter(([, value]) => value).map(([label, value]) => <div key={label}><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 font-medium">{value}</p></div>)}</div>
                        </>}
                        {item.grammar.otherForms.map(group => <section key={group.title} className="space-y-3"><h3 className="text-sm font-medium">{group.title}</h3><div className="grid gap-6 sm:grid-cols-2">{group.forms.map(form => <article key={`${form.label}-${form.value}`} className="flex items-start justify-between gap-4 border-b border-border/40 py-3 last:border-0"><div><p className="text-sm font-medium">{form.label}</p>{form.description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{form.description}</p>}</div><p className="shrink-0 text-base font-semibold text-primary">{form.value}</p></article>)}</div></section>)}
                    </section>}
                    {!!item.grammar?.popularMistakes.length && <MistakesGuide mistakes={item.grammar.popularMistakes} />}
                    {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
                    </TabsContent>
                </div>


            </div>
            <TabsContent value="chat" className="w-full">
                <ChatCard item={item} question={question} setQuestion={setQuestion} chatBusy={chatBusy} chatError={chatError} ask={ask} clearChat={clearChat} clearChatBusy={clearChatBusy} active={activeSection === "chat"} />
            </TabsContent>
            </Tabs>
        </div>
    )
}

type YouGlishWidget = {
    fetch: (query: string, language: string, accent?: string) => void
    close?: () => void
}

type YouGlishApi = { Widget: new (element: HTMLElement | string, options: { width: number; components: number; autoStart: number }) => YouGlishWidget }

declare global {
    interface Window {
        YG?: YouGlishApi
        onYouglishAPIReady?: () => void
    }
}

let youglishLoadPromise: Promise<void> | undefined
let youglishTargetId = 0

function loadYouGlishApi() {
    if (window.YG) return Promise.resolve()
    if (!youglishLoadPromise) {
        youglishLoadPromise = new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[src="https://youglish.com/public/emb/widget.js"]')
            const previousReady = window.onYouglishAPIReady
            const timeout = window.setTimeout(() => {
                youglishLoadPromise = undefined
                reject(new Error("YouGlish took too long to load."))
            }, 15000)
            window.onYouglishAPIReady = () => {
                try {
                    previousReady?.()
                } finally {
                    window.clearTimeout(timeout)
                    if (window.YG) resolve()
                    else {
                        youglishLoadPromise = undefined
                        reject(new Error("YouGlish API is unavailable."))
                    }
                }
            }
            if (existing) {
                existing.addEventListener("error", () => {
                    window.clearTimeout(timeout)
                    youglishLoadPromise = undefined
                    reject(new Error("Could not load YouGlish."))
                }, { once: true })
                return
            }
            const script = document.createElement("script")
            script.src = "https://youglish.com/public/emb/widget.js"
            script.async = true
            script.onerror = () => {
                window.clearTimeout(timeout)
                youglishLoadPromise = undefined
                reject(new Error("Could not load YouGlish."))
            }
            document.head.appendChild(script)
        })
    }
    return youglishLoadPromise
}

function YouGlishExample({ query }: { query: string }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const mountRef = useRef<HTMLDivElement>(null)
    const widgetRef = useRef<YouGlishWidget | null>(null)
    const normalizedQuery = query.trim().replace(/\s+/g, " ")

    useEffect(() => () => { widgetRef.current?.close?.() }, [])

    const closeVideo = () => {
        widgetRef.current?.close?.()
        widgetRef.current = null
        if (mountRef.current) mountRef.current.replaceChildren()
        setOpen(false)
        setLoading(false)
        setError("")
    }

    const showVideo = async () => {
        setOpen(true)
        if (widgetRef.current || loading) return
        setLoading(true)
        setError("")
        try {
            await loadYouGlishApi()
            const mount = mountRef.current
            if (!mount || !window.YG) return
            // YouGlish replaces the target. Use its documented unique-ID form so
            // the API resolves the exact live node when constructing the widget.
            const widgetTarget = document.createElement("div")
            const targetId = `youglish-widget-${++youglishTargetId}`
            widgetTarget.id = targetId
            widgetTarget.className = "w-full overflow-hidden rounded-md bg-muted/30"
            mount.replaceChildren(widgetTarget)
            const widget = new window.YG.Widget(targetId, { width: mount.clientWidth, components: 1 + 4 + 8 + 16 + 64, autoStart: 0 })
            widgetRef.current = widget
            widget.fetch(normalizedQuery, "english")
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load the video player.")
        } finally {
            setLoading(false)
        }
    }

    if (!normalizedQuery) return null
    return <div className="mt-1">
        {!open ? <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-primary" onClick={() => void showVideo()}><Clapperboard className="size-3.5" />Watch in context</Button> : <>
            <div className="w-full">
                <div className="mb-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon-sm" className="size-7" onClick={closeVideo} aria-label="Close YouGlish player" title="Close YouGlish player"><X className="size-4" /></Button>
                </div>
                <div ref={mountRef} className="w-full" />
            </div>
            {loading && <p className="mt-1 text-xs text-muted-foreground">Loading videoâ€¦</p>}
            {error && <p role="status" className="mt-1 text-xs text-muted-foreground">{error} <a className="underline" href={`https://youglish.com/pronounce/${encodeURIComponent(normalizedQuery)}/english`} target="_blank" rel="noreferrer">Open on YouGlish</a></p>}
        </>}
    </div>
}

function ChatCard({
    item, question, setQuestion, chatBusy, chatError, ask, clearChat, clearChatBusy, active,
}: {
    item: Item
    question: string
    setQuestion: (value: string) => void
    chatBusy: boolean
    chatError: string
    ask: (event: React.FormEvent<HTMLFormElement>) => void
    clearChat: () => void
    clearChatBusy: boolean
    active: boolean
}) {
    const prompts = [
        "Add a natural example for meaning 1",
        "Add another common meaning",
        "Explain the difference between meanings",
    ]
    const messages = item.chat?.messages ?? []
    const latestMessage = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (active) latestMessage.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [active, messages.length])

    return <section className="w-full">
        <header className="mb-4 flex items-start justify-between gap-3">
            <div>
            <h2 className="text-sm font-medium">Word assistant</h2>
            <p className="text-xs text-muted-foreground">Ask a question or request a change to this entry.</p>
            </div>
            {messages.length > 0 && <AlertDialog>
                <Button type="button" variant="ghost" size="sm" className={cn(buttonVariants({variant: "destructive"}), "h-8 shrink-0 gap-1.5 px-2 text-xs hover:text-red-400")} disabled={chatBusy || clearChatBusy} render={<AlertDialogTrigger />}>
                    {clearChatBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />}
                    Clear chat
                </Button>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear this chat?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the conversation about â€œ{item.term}â€.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={clearChat} className="bg-destructive text-white hover:bg-destructive/90">Clear chat</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>}
        </header>
        <div className="space-y-6 pb-4">
            {messages.length === 0 ? <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 py-8">
                <p className="text-sm text-muted-foreground">Try one of these</p>
                <div className="flex flex-wrap justify-center gap-2">{prompts.map(prompt => <Button key={prompt} type="button" variant="outline" size="sm" className="h-auto whitespace-normal rounded-full py-1.5 text-xs" onClick={() => setQuestion(prompt)}>{prompt}</Button>)}</div>
            </div> : messages.map((message, index) => message.role === "user"
                ? <article key={`${index}-${message.role}`} className="ml-auto w-fit max-w-[min(85%,52rem)] rounded-3xl bg-muted px-4 py-2.5 text-sm leading-5">{message.content}</article>
                : <article key={`${index}-${message.role}`} className="w-full text-sm leading-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={assistantMarkdownComponents}>{message.content}</ReactMarkdown>
                </article>)}
            <div ref={latestMessage} />
        </div>
            <form onSubmit={ask} className="sticky bottom-2 z-10 flex items-end gap-2 rounded-3xl border bg-background/95 p-2 shadow-sm backdrop-blur focus-within:ring-2 focus-within:ring-primary/20">
                <textarea rows={2} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); if (question.trim() && !chatBusy) event.currentTarget.form?.requestSubmit() } }} disabled={chatBusy} placeholder={`Ask about ${item.term} or request an update`} className="max-h-40 min-h-12 min-w-0 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-50" />
                <Button type="submit" size="icon-sm" className="rounded-full" aria-label="Send message" disabled={chatBusy || !question.trim()}>{chatBusy ? <LoaderCircle className="size-4 animate-spin"/> : <Send className="size-4"/>}</Button>
            </form>
        {chatError && <p role="alert" className="mt-2 text-sm text-destructive">{chatError}</p>}
    </section>
}

const assistantMarkdownComponents: import("react-markdown").Components = {
    p: ({ children }) => <p className="my-2 leading-7 first:mt-0 last:mb-0">{children}</p>,
    h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold tracking-tight first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-primary/70">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5 leading-6">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>,
    table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border-b px-2 py-1.5 font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-border/60 px-2 py-1.5 align-top">{children}</td>,
    code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
    pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{children}</pre>,
    hr: () => <hr className="my-3 border-border" />,
}
function UsageGuide({ usage }: { usage: UsageNotes }) {
    return (
        <Card className="overflow-hidden border-primary/20 bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center gap-2 border-b bg-primary/[0.045] px-3 py-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookOpenText className="size-4" /></span>
                <div>
                    <CardTitle className="text-sm">How to use it</CardTitle>
                    <p className="text-[11px] text-muted-foreground">Meaning, tone, and natural combinations</p>
                </div>
            </CardHeader>
            <CardContent className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <div className="space-y-2">
                    {usage.nuance.map((text, index) => <div key={index} className="flex gap-2 text-xs leading-5">
                        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p>{text}</p>
                    </div>)}
                    {usage.other.map((text, index) => <p key={index} className="text-xs leading-5">{text}</p>)}
                    {usage.register.map((text, index) => <p key={index} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary/60" />{text}</p>)}
                    {usage.examples.length > 0 && <div className="pt-1">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Examples of use</p>
                        <div className="grid gap-1.5 sm:grid-cols-2">{usage.examples.map((example, index) => {
                            const [sentence, translation] = example.split(" | ", 2)
                            return <div key={`${index}-${example}`} className="rounded-md bg-muted/45 px-2.5 py-2 text-xs leading-5">
                                <p className="font-medium">{sentence}</p>
                                {translation && <p className="text-muted-foreground">{translation}</p>}
                            </div>
                        })}</div>
                    </div>}
                </div>
                {usage.patterns.length > 0 && <div className="sm:max-w-64">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Common patterns</p>
                    <div className="flex flex-wrap gap-1.5">{usage.patterns.map((pattern, index) => <span key={`${index}-${pattern}`} className="rounded-md border border-border/80 bg-muted/35 px-2 py-1 font-mono text-[11px] leading-4">{pattern}</span>)}</div>
                </div>}
            </CardContent>
        </Card>
    )
}

function MistakesGuide({ mistakes }: { mistakes: string[] }) {
    return (
        <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400"><MessageCircleWarning className="size-4" /></span>
                <div><CardTitle className="text-sm">Common mistakes</CardTitle><p className="text-[11px] text-muted-foreground">Quick checks before you use it</p></div>
            </CardHeader>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
                {mistakes.map((mistake, index) => <div key={`${index}-${mistake}`} className="flex gap-2 rounded-lg border bg-muted/15 p-2.5 text-xs leading-5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <p>{mistake}</p>
                </div>)}
            </CardContent>
        </Card>
    )
}
