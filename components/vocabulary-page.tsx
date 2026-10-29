"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Bookmark, BookOpen, Check, ChevronRight, Languages, MonitorPlay, Trash2 } from "lucide-react"
import { TranslationHistoryDrawer, type TranslationHistoryEntry } from "@/components/translation-history-drawer"
import { VocabularyAddDialog } from "@/components/vocabulary-add-dialog"

import { Badge } from "@/components/ui/badge"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

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
    meanings: {
        id: string
        definition: string
        translation: string | null
        partOfSpeech: string | null
        examples: {
            id: string
            text: string
            sourceTitle: string | null
            sourceUrl: string | null
        }[]
    }[]
}

const labels = {
    NEW: "NEW",
    LEARNING: "LEARNING",
    FAMILIAR: "FAMILIAR",
    MASTERED: "MASTERED",
}

const familiarityStyles: Record<Item["familiarity"], string> = {
    NEW: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
    LEARNING:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
    FAMILIAR:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
    MASTERED:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
}

const typeLabels: Record<string, string> = {
    WORD: "Word",
    PHRASE: "Phrase",
    PHRASAL_VERB: "Phrasal verb",
    COLLOCATION: "Collocation",
    IDIOM: "Idiom",
}

export function VocabularyPage({
                                   items,
                                   total,
                                   markedItems,
                                   translationEntries,
                               }: {
    items: Item[]
    total: number
    markedItems: {
        id: string; kind: string; text: string; context: string; sourceType: string; sourceTitle: string; sourceUrl: string | null; locationLabel: string | null; locationValue: number | null; createdAt: Date; vocabularyEntries: { id: string; term: string }[]
    }[]
    translationEntries: {
        id: string; text: string; context: string; explanation: unknown; chat: unknown; sourceType: string; sourceTitle: string; sourceUrl: string | null; locationLabel: string | null; locationValue: number | null; updatedAt: Date
    }[]
}) {
    const [progress, setProgress] = useState("ALL")
    const [date, setDate] = useState("NEWEST")
    const [view, setView] = useState<"VOCABULARY" | "MARKED" | "TRANSLATIONS">("VOCABULARY")
    const [sourceFilter, setSourceFilter] = useState("ALL")
    const [selectedTranslation, setSelectedTranslation] = useState<TranslationHistoryEntry | null>(null)
    const [removedMarkedIds, setRemovedMarkedIds] = useState<Set<string>>(() => new Set())
    const [markedActionBusy, setMarkedActionBusy] = useState<string | null>(null)
    const [markedActionError, setMarkedActionError] = useState("")
    const [markedTranslationLoading, setMarkedTranslationLoading] = useState(false)
    const [markedTranslationError, setMarkedTranslationError] = useState("")
    const [markedAddStatuses, setMarkedAddStatuses] = useState<Record<string, string>>({})
    const vocabularyOnly = items.length === 0 && (markedItems.length > 0 || translationEntries.length > 0)
    const activeView = vocabularyOnly ? view === "VOCABULARY" ? "MARKED" : view : view

    const filtered = useMemo(
        () =>
            items
                .filter(
                    (item) =>
                        progress === "ALL" ||
                        item.familiarity === progress,
                )
                .sort((a, b) =>
                    date === "OLDEST"
                        ? a.createdAt.getTime() -
                        b.createdAt.getTime()
                        : b.createdAt.getTime() -
                        a.createdAt.getTime(),
                ),
        [items, progress, date],
    )

    async function removeMarked(id: string) {
        setMarkedActionBusy(id); setMarkedActionError("")
        try {
            const response = await fetch(`/api/learning-history?id=${encodeURIComponent(id)}`, { method: "DELETE" })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not delete this marked item.")
            setRemovedMarkedIds(current => new Set(current).add(id))
        } catch (cause) { setMarkedActionError(cause instanceof Error ? cause.message : "Could not delete this marked item.") }
        finally { setMarkedActionBusy(null) }
    }

    async function translateMarked(id: string) {
        const marked = markedItems.find(item => item.id === id)
        if (!marked) return
        setSelectedTranslation({ id: `pending:${id}`, text: marked.text, context: marked.context, explanation: {}, chat: [], sourceType: marked.sourceType, sourceTitle: marked.sourceTitle, locationLabel: marked.locationLabel, locationValue: marked.locationValue })
        setMarkedTranslationLoading(true); setMarkedTranslationError("")
        try {
            const response = await fetch("/api/learning-history/translations/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ markedItemId: id }) })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not explain this expression.")
            setSelectedTranslation(result.entry)
        } catch (cause) { setMarkedTranslationError(cause instanceof Error ? cause.message : "Could not explain this expression.") }
        finally { setMarkedTranslationLoading(false) }
    }

    return (
        <section className="space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-primary">
                        Your library
                    </p>

                    <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                        Vocabulary
                    </h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {total} saved{" "}
                        {total === 1 ? "item" : "items"}
                    </p>
                </div>

                <div className="flex gap-2">
                    <Select
                        value={progress}
                        onValueChange={(value) =>
                            setProgress(value ?? "ALL")
                        }
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Progress" />
                        </SelectTrigger>

                        <SelectContent>
                            <SelectItem value="ALL">
                                All progress
                            </SelectItem>

                            {Object.entries(labels).map(
                                ([key, label]) => (
                                    <SelectItem
                                        key={key}
                                        value={key}
                                    >
                                        {label}
                                    </SelectItem>
                                ),
                            )}
                        </SelectContent>
                    </Select>

                    <Select
                        value={date}
                        onValueChange={(value) =>
                            setDate(value ?? "NEWEST")
                        }
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Date" />
                        </SelectTrigger>

                        <SelectContent>
                            <SelectItem value="NEWEST">
                                Newest first
                            </SelectItem>

                            <SelectItem value="OLDEST">
                                Oldest first
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </header>

            <div className="flex flex-wrap gap-2 border-b pb-3">
                {(["VOCABULARY", "MARKED", "TRANSLATIONS"] as const).map((key) => <button key={key} type="button" aria-pressed={activeView === key} onClick={() => setView(key)} className={`rounded-full px-4 py-2 text-sm ${activeView === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {key === "VOCABULARY" ? `Vocabulary ${total}` : key === "MARKED" ? `Marked ${markedItems.length}` : `Translation history ${translationEntries.length}`}
                </button>)}
            </div>

            {activeView !== "VOCABULARY" && <div className="flex flex-wrap gap-2">
                {[["ALL", "All sources"], ["WATCH", "Watch"], ["READ", "Read"], ["VOCABULARY", "Vocabulary"]].map(([value, label]) => <button key={value} type="button" aria-pressed={sourceFilter === value} onClick={() => setSourceFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs ${sourceFilter === value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{label}</button>)}
            </div>}

            {activeView === "MARKED" && <div className="space-y-3">
                {markedActionError && <p role="alert" className="text-sm text-destructive">{markedActionError}</p>}
                {markedItems.filter(item => !removedMarkedIds.has(item.id) && (sourceFilter === "ALL" || item.sourceType === sourceFilter)).map(item => { const savedEntries = item.vocabularyEntries; return <article key={item.id} className="rounded-xl border p-4"><div className="flex items-start gap-3"><Bookmark className="mt-1 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">{item.text}</p>{item.kind !== "LINE" && <p className="mt-1 text-sm text-muted-foreground">{item.context}</p>}<p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{item.sourceType === "WATCH" ? <MonitorPlay className="size-3.5" /> : <BookOpen className="size-3.5" />}{item.sourceTitle}{item.locationLabel && item.locationValue !== null ? ` · ${item.locationLabel} ${item.locationValue}` : ""} · {new Date(item.createdAt).toLocaleDateString()}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={markedTranslationLoading} onClick={() => void translateMarked(item.id)} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70 disabled:opacity-50"><Languages className="size-3.5" />Translation and usage</button><VocabularyAddDialog term={item.text} context={item.context} source={{ title: item.sourceTitle, url: item.sourceUrl || undefined, id: `marked:${item.id}` }} initiallyInVocabulary={savedEntries.length > 0 || Boolean(markedAddStatuses[item.id])} initialVocabularyEntries={savedEntries} triggerClassName="h-auto rounded-full px-3 py-1.5 text-xs" onAdded={(term) => setMarkedAddStatuses(current => ({ ...current, [item.id]: term }))} /><button type="button" disabled={markedActionBusy === item.id} onClick={() => void removeMarked(item.id)} aria-label="Delete marked item" title="Delete marked item" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 className="size-3.5" />Delete</button></div></div></div></article>})}
                {!markedItems.some(item => !removedMarkedIds.has(item.id) && (sourceFilter === "ALL" || item.sourceType === sourceFilter)) && <Card className="p-8 text-center text-sm text-muted-foreground">No marked items from this source yet.</Card>}
            </div>}

            {activeView === "TRANSLATIONS" && <div className="space-y-3">
                {translationEntries.filter(item => sourceFilter === "ALL" || item.sourceType === sourceFilter).map(item => { const explanation = item.explanation as { wordTranslation?: string; contextMeaning?: string }; return <button type="button" key={item.id} onClick={() => setSelectedTranslation(item)} className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-start gap-3"><Languages className="mt-1 size-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">{item.text}</p><p className="mt-1 text-sm text-muted-foreground">{item.context}</p>{explanation.contextMeaning && <p className="mt-3 text-sm">{explanation.contextMeaning}</p>}{explanation.wordTranslation && <p className="mt-1 text-sm font-medium text-primary">{explanation.wordTranslation}</p>}<p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Languages className="size-3.5" />{item.sourceTitle}{item.locationLabel && item.locationValue !== null ? ` · ${item.locationLabel} ${item.locationValue}` : ""} · {new Date(item.updatedAt).toLocaleDateString()}</p>{Array.isArray(item.chat) && item.chat.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{item.chat.length} follow-up messages</p>}</div></div></button>})}
                {!translationEntries.some(item => sourceFilter === "ALL" || item.sourceType === sourceFilter) && <Card className="p-8 text-center text-sm text-muted-foreground">Translations you look up will appear here.</Card>}
            </div>}

            <TranslationHistoryDrawer key={selectedTranslation?.id || "closed"} entry={selectedTranslation} loading={markedTranslationLoading} requestError={markedTranslationError} onOpenChange={open => { if (!open) { setSelectedTranslation(null); setMarkedTranslationError("") } }} />

            {activeView === "VOCABULARY" && filtered.length === 0 ? (
                <Card className="p-10 text-center text-muted-foreground">
                    No vocabulary matches these filters.
                </Card>
            ) : activeView === "VOCABULARY" ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((item) => (
                        <Link
                            key={item.id}
                            href={`/vocabulary/${item.id}`}
                            className="text-left"
                        >
                            <Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-3">
                                        <CardTitle className="truncate text-lg">
                                            {item.term}
                                        </CardTitle>

                                        <Badge
                                            variant="outline"
                                            className={
                                                familiarityStyles[
                                                    item.familiarity
                                                ]
                                            }
                                        >
                                            {
                                                labels[
                                                    item.familiarity
                                                    ]
                                            }
                                        </Badge>
                                    </div>

                                    <CardDescription>
                                        {item.phonetic ??
                                            typeLabels[item.type]}
                                    </CardDescription>
                                </CardHeader>

                                <CardContent>
                                    <p className="line-clamp-2 text-sm">
                                        {item.meanings[0]
                                                ?.definition ??
                                            "No definition yet"}
                                    </p>

                                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>
                                            {
                                                item.meanings
                                                    .length
                                            }{" "}
                                            {item.meanings
                                                .length === 1
                                                ? "meaning"
                                                : "meanings"}
                                        </span>

                                        <ChevronRight className="size-4" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            ) : null}
</section>
)}
