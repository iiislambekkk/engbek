"use client"

import { useMemo, useState } from "react"
import { Check, ChevronRight, Volume2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Item = {
    id: string; term: string; type: string; phonetic: string | null; pronunciation: string | null
    familiarity: "NEW" | "LEARNING" | "FAMILIAR" | "MASTERED"; createdAt: Date; updatedAt: Date
    notes: string | null; meanings: { id: string; definition: string; translation: string | null; examples: { id: string; text: string }[] }[]
    tags: { tag: { name: string } }[]
}

const labels = { NEW: "New", LEARNING: "In progress", FAMILIAR: "Familiar", MASTERED: "Known" }
const typeLabels: Record<string, string> = { WORD: "Word", PHRASE: "Phrase", PHRASAL_VERB: "Phrasal verb", COLLOCATION: "Collocation", IDIOM: "Idiom" }

export function VocabularyPage({ items, total }: { items: Item[]; total: number }) {
    const [progress, setProgress] = useState("ALL")
    const [date, setDate] = useState("NEWEST")
    const [selected, setSelected] = useState<Item | null>(null)
    const filtered = useMemo(() => items.filter((item) => progress === "ALL" || item.familiarity === progress).sort((a, b) => date === "OLDEST" ? a.createdAt.getTime() - b.createdAt.getTime() : b.createdAt.getTime() - a.createdAt.getTime()), [items, progress, date])
    const update = async (familiarity: Item["familiarity"]) => {
        if (!selected) return
        const response = await fetch(`/api/vocabulary/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ familiarity }) })
        if (response.ok) setSelected({ ...selected, familiarity })
    }
    const speak = () => { if (selected && "speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(selected.term)) } }

    return <section className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-medium text-primary">Your library</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Vocabulary</h1><p className="mt-2 text-sm text-muted-foreground">{total} saved {total === 1 ? "item" : "items"}</p></div>
            <div className="flex gap-2"><Select value={progress} onValueChange={(v) => setProgress(v ?? "ALL")}><SelectTrigger><SelectValue placeholder="Progress" /></SelectTrigger><SelectContent><SelectItem value="ALL">All progress</SelectItem>{Object.entries(labels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select><Select value={date} onValueChange={(v) => setDate(v ?? "NEWEST")}><SelectTrigger><SelectValue placeholder="Date" /></SelectTrigger><SelectContent><SelectItem value="NEWEST">Newest first</SelectItem><SelectItem value="OLDEST">Oldest first</SelectItem></SelectContent></Select></div>
        </header>
        {filtered.length === 0 ? <Card className="p-10 text-center text-muted-foreground">No vocabulary matches these filters.</Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="text-left"><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="truncate text-lg">{item.term}</CardTitle><Badge variant={item.familiarity === "MASTERED" ? "default" : "secondary"}>{labels[item.familiarity]}</Badge></div><CardDescription>{item.phonetic ?? typeLabels[item.type]}</CardDescription></CardHeader><CardContent><p className="line-clamp-2 text-sm">{item.meanings[0]?.definition ?? "No definition yet"}</p><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{item.meanings.length} {item.meanings.length === 1 ? "meaning" : "meanings"}</span><ChevronRight className="size-4" /></div></CardContent></Card></button>)}</div>}
        {selected && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}><Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}><CardHeader><div className="flex justify-between gap-4"><div><CardTitle className="text-3xl">{selected.term}</CardTitle><CardDescription className="mt-2">{selected.phonetic ?? "No phonetic transcription"} · {typeLabels[selected.type]}</CardDescription></div><Button size="icon" variant="outline" onClick={speak} aria-label="Pronounce word"><Volume2 /></Button></div></CardHeader><CardContent className="space-y-5"><div className="flex flex-wrap gap-2">{(["LEARNING", "MASTERED"] as const).map((value) => <Button key={value} variant={selected.familiarity === value ? "default" : "outline"} onClick={() => update(value)}>{selected.familiarity === value && <Check />} {labels[value]}</Button>)}</div>{selected.meanings.map((meaning, i) => <div key={meaning.id} className="space-y-2 border-t pt-4"><p className="font-medium">{i + 1}. {meaning.definition}</p>{meaning.translation && <p className="text-muted-foreground">{meaning.translation}</p>}{meaning.examples.map((example) => <p key={example.id} className="rounded-lg bg-muted/50 p-3 text-sm italic">“{example.text}”</p>)}</div>)}{selected.notes && <div className="border-t pt-4 text-sm text-muted-foreground">{selected.notes}</div>}</CardContent></Card></div>}
    </section>
}
