"use client"

import { Copy, Highlighter, Languages, X } from "lucide-react"
import { VocabularyAddDialog } from "@/components/vocabulary-add-dialog"

export type SelectionWord = { key: string; text: string; active: boolean }

export function SelectionMenu({
  words,
  text,
  position,
  busy = false,
  vocabulary,
  onToggleWord,
  onTranslate,
  onHighlight,
  onCopy,
  onClose,
}: {
  words?: SelectionWord[]
  text: string
  position: { top: number; left: number }
  busy?: boolean
  vocabulary?: { term: string; context: string; source: { title?: string; url?: string; id?: string }; onAdded?: (term: string) => void }
  onToggleWord?: (key: string) => void
  onTranslate: (text: string) => void
  onHighlight: (text: string) => void
  onCopy: (text: string) => void
  onClose: () => void
}) {
  const selectedText = words ? words.filter(word => word.active).map(word => word.text).join(" ") : text

  return <div data-selection-menu style={{ top: position.top, left: position.left, width: "min(calc(100vw - 24px), 380px)" }} className="fixed z-[60] flex max-h-[40dvh] flex-col gap-1.5 overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl" onClick={event => event.stopPropagation()}>
    <div className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 px-3 py-2 text-sm font-semibold leading-6">{words?.map((word, index) => <button key={`${word.key}-${index}`} type="button" aria-pressed={word.active} onClick={() => onToggleWord?.(word.key)} className={`mr-1 inline rounded px-0.5 transition-colors ${word.active ? "text-primary" : "text-muted-foreground/45 line-through"}`}>{word.text}</button>) || text}</div>
    <div className="flex flex-row justify-around gap-1">
      <button type="button" aria-label="Translate and explain" title="Translate and explain" disabled={!selectedText} onClick={() => onTranslate(selectedText)} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted disabled:opacity-40"><Languages className="size-4" /></button>
      {vocabulary && selectedText && <VocabularyAddDialog key={`${vocabulary.source.id}-${selectedText}`} term={selectedText} context={vocabulary.context} source={vocabulary.source} triggerClassName="size-10 px-0" compact onAdded={vocabulary.onAdded} />}
      <button type="button" aria-label="Highlight" title="Highlight" disabled={busy || !selectedText} onClick={() => onHighlight(selectedText)} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"><Highlighter className="size-4" /></button>
      <button type="button" aria-label="Copy" title="Copy" disabled={!selectedText} onClick={() => onCopy(selectedText)} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted disabled:opacity-40"><Copy className="size-4" /></button>
      <button type="button" aria-label="Close" title="Close" onClick={onClose} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground"><X className="size-4" /></button>
    </div>
  </div>
}
