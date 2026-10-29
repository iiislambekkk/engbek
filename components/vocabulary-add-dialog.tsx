"use client"

import { useState } from "react"
import { Check, LoaderCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Candidate = { term: string; type: string; explanation: string }
type SimilarItem = { id: string; term: string; type: string }
type SelectionSuggestion = { term: string; explanation: string }
type VocabularyEntry = { id: string; term: string; sources: { sourceId: string | null; reason: string; createdAt: string; label: string }[] }
type AddResult = { status: "ambiguous"; originalTerm: string; candidates: Candidate[] } | { status: "similar"; term: string; similarItems: SimilarItem[] } | { status: "added"; term: string; created: boolean; alreadyInVocabulary: boolean; newContext: boolean }

export function VocabularyAddDialog({
  term,
  context = "",
  source,
  onAdded,
  triggerClassName,
  compact = false,
  requireSelection = false,
  initiallyInVocabulary = false,
  initialVocabularyEntries = [],
}: {
  term: string
  context?: string
  source?: { title?: string; url?: string; id?: string }
  onAdded?: (term: string, result: Extract<AddResult, { status: "added" }>) => void
  triggerClassName?: string
  compact?: boolean
  requireSelection?: boolean
  initiallyInVocabulary?: boolean
  initialVocabularyEntries?: { id: string; term: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([])
  const [savedEntries, setSavedEntries] = useState<VocabularyEntry[]>([])
  const [showSavedEntries, setShowSavedEntries] = useState(false)
  const [savedEntriesLoading, setSavedEntriesLoading] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState(initiallyInVocabulary ? "In Vocabulary" : "")
  const [manualSelection, setManualSelection] = useState(false)
  const [selectedTokens, setSelectedTokens] = useState<number[]>([])
  const [selectionChoice, setSelectionChoice] = useState("")
  const [suggestions, setSuggestions] = useState<SelectionSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState("")
  const tokens = term.match(/\S+/g) || []
  function selectToken(index: number) {
    const current = selectedTokens
    let next: number[]
    if (!current.length) next = [index]
    else {
      const first = Math.min(...current)
      const last = Math.max(...current)
      if (index < first) next = Array.from({ length: last - index + 1 }, (_, offset) => index + offset)
      else if (index > last) next = Array.from({ length: index - first + 1 }, (_, offset) => first + offset)
      else if (index === first && first < last) next = Array.from({ length: last - first }, (_, offset) => first + offset + 1)
      else if (index === last && first < last) next = Array.from({ length: last - first }, (_, offset) => first + offset)
      else next = [index]
    }
    setSelectedTokens(next)
    setSelectionChoice(next.map(tokenIndex => tokens[tokenIndex]).filter(Boolean).join(" "))
  }

  async function loadSelectionSuggestions() {
    setSuggestionsLoading(true)
    setSuggestionsError("")
    try {
      const response = await fetch("/api/vocabulary/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: term, context }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not suggest vocabulary choices.")
      setSuggestions(result.suggestions || [])
    } catch (cause) {
      setSuggestionsError(cause instanceof Error ? cause.message : "Could not suggest vocabulary choices.")
    } finally {
      setSuggestionsLoading(false)
    }
  }

  async function openSavedEntries() {
    setShowSavedEntries(true)
    setOpen(true)
    setSavedEntriesLoading(true)
    setError("")
    try {
      const response = await fetch("/api/vocabulary/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sources", term, source }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not load saved entries.")
      setSavedEntries(result.entries || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load saved entries.")
    } finally {
      setSavedEntriesLoading(false)
    }
  }

  async function add(candidate?: string) {
    if (busy) return
    const shouldChooseText = requireSelection || term.trim().split(/\s+/).length > 1
    if (shouldChooseText && !candidate && !manualSelection) {
      setManualSelection(true)
      setSelectedTokens([])
      setSelectionChoice("")
      setSuggestions([])
      void loadSelectionSuggestions()
      setOpen(true)
      return
    }
    setBusy(true)
    setError("")
    setStatus("")
    try {
      const response = await fetch("/api/vocabulary/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term, context, source, candidate, allowSimilar: false }),
      })
      const result = await response.json() as AddResult & { error?: string }
      if (!response.ok) throw new Error(result.error || "Could not add this entry.")
      if (result.status === "similar") {
        setSimilarItems(result.similarItems)
        setOpen(true)
        return
      }
      if (result.status === "ambiguous") {
        setManualSelection(false)
        setCandidates(result.candidates)
        setOpen(true)
        return
      }
      setCandidates([])
      setManualSelection(false)
      setShowSavedEntries(false)
      setStatus(`Added “${result.term}” to Vocabulary.`)
      onAdded?.(result.term, result)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this entry.")
    } finally {
      setBusy(false)
    }
  }

  async function addSeparately() {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/vocabulary/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term, context, source, allowSimilar: true }),
      })
      const result = await response.json() as AddResult & { error?: string }
      if (!response.ok) throw new Error(result.error || "Could not add this entry.")
      if (result.status !== "added") throw new Error("Choose a specific entry before adding it.")
      setSimilarItems([])
      setStatus(`Added “${result.term}” to Vocabulary.`)
      onAdded?.(result.term, result)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this entry.")
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Button type="button" variant="outline" size="sm" className={triggerClassName} aria-label={status ? "In Vocabulary" : "Add to Vocabulary"} disabled={busy} onClick={() => { if (status) { setSavedEntries(current => current.length ? current : initialVocabularyEntries.map(entry => ({ ...entry, sources: [] }))); void openSavedEntries() } else { setCandidates([]); setSimilarItems([]); setShowSavedEntries(false); setError(""); void add() } }}>
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : status ? <Check className="size-4" /> : <Plus className="size-4" />}{!compact && (busy ? " Adding…" : status ? " In Vocabulary" : " Add to Vocabulary")}
    </Button>
    {status && <span role="status" className="sr-only">{status}</span>}
    <Dialog open={open} onOpenChange={next => { if (!busy) { setOpen(next); if (!next) { setManualSelection(false); setSelectionChoice("") } } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{showSavedEntries ? "Saved in Vocabulary" : similarItems.length ? "A similar word is already saved" : manualSelection ? "Choose the words to save" : "Which form should be saved?"}</DialogTitle>
          <DialogDescription>{showSavedEntries ? `Entries for “${term}”, including where each one was added.` : similarItems.length ? `You’re adding “${term}”. Check whether it is a different form of a word you already know.` : manualSelection ? "Select one or more words from this sentence. We’ll find the dictionary form after you choose." : `The selection “${term}” could refer to more than one dictionary entry. Choose the form you want in Vocabulary.`}</DialogDescription>
        </DialogHeader>
        {showSavedEntries ? <div className="space-y-3">
          {savedEntriesLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading saved entries…</p> : savedEntries.length ? savedEntries.map(entry => <article key={entry.id} className="rounded-xl border p-3"><a href={`/vocabulary/${entry.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{entry.term}</a><div className="mt-2 space-y-1">{entry.sources.map((savedSource, index) => <p key={`${savedSource.sourceId}-${index}`} className="text-xs text-muted-foreground">{savedSource.label}</p>)}</div></article>) : <p className="text-sm text-muted-foreground">No saved entry found for this word.</p>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setShowSavedEntries(false); setOpen(false); setStatus(""); setTimeout(() => void add(), 0) }}><Plus className="size-4" />Add another entry</Button>
        </div> : similarItems.length ? <div className="space-y-3">
          {similarItems.map(item => <a key={item.id} href={`/vocabulary/${item.id}`} className="block rounded-xl border bg-muted/40 px-4 py-3 text-sm font-medium hover:bg-muted">{item.term}<span className="mt-1 block text-xs font-normal text-muted-foreground">Already in your Vocabulary</span></a>)}
          <p className="text-sm text-muted-foreground">You can still save “{term}” as a separate entry if it has a different meaning or use.</p>
          <Button type="button" disabled={busy} onClick={() => void addSeparately()}>{busy && <LoaderCircle className="size-4 animate-spin" />}Add “{term}” separately</Button>
        </div> : manualSelection ? <div className="space-y-4">
          <section className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI suggestions</h3>{suggestionsLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Finding useful words and phrases…</p> : suggestions.length ? <div className="space-y-2">{suggestions.map((suggestion, index) => <button key={`${suggestion.term}-${index}`} type="button" onClick={() => { setSelectionChoice(suggestion.term); setSelectedTokens([]) }} className={`block w-full rounded-xl border px-3 py-2 text-left transition-colors hover:bg-muted/60 ${selectionChoice === suggestion.term ? "border-primary bg-primary/5" : ""}`}><span className="block text-sm font-medium">{suggestion.term}</span><span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.explanation}</span></button>)}</div> : <p className="text-xs text-muted-foreground">{suggestionsError || "No suggestions yet. Select words below or enter your own."}</p>}</section>
          <section className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or choose from the sentence</h3><div className="flex flex-wrap gap-2 rounded-xl bg-muted/50 p-3">{tokens.map((token, index) => <button key={`${token}-${index}`} type="button" aria-pressed={selectedTokens.includes(index)} onClick={() => selectToken(index)} className={`rounded-md px-2 py-1.5 text-sm ${selectedTokens.includes(index) ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{token}</button>)}</div></section>
          <label className="block space-y-2 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or enter your own</span><input value={selectionChoice} onChange={event => { setSelectionChoice(event.target.value); setSelectedTokens([]) }} placeholder="Type a word or phrase" className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <Button type="button" disabled={busy || !selectionChoice.trim()} onClick={() => void add(selectionChoice.trim())}>{busy && <LoaderCircle className="size-4 animate-spin" />}Add “{selectionChoice.trim() || "selected words"}”</Button>
        </div> : <div className="space-y-2">
          {candidates.map(candidate => <button key={`${candidate.type}-${candidate.term}`} type="button" disabled={busy} onClick={() => void add(candidate.term)} className="flex w-full items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50">
            <span><span className="block font-medium">{candidate.term}</span><span className="mt-0.5 block text-xs text-muted-foreground">{candidate.explanation}</span></span>
            {busy ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <Check className="size-4 shrink-0 text-muted-foreground" />}
          </button>)}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
