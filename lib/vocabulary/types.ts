export type GrammarData = {
  verbForms: { base: string; thirdPerson: string; past: string; pastParticiple: string; ing: string }
  verbTenses: {
    key: "past" | "present" | "future"
    title: string
    aspects: { name: string; form: string; description: string; clues: string[]; timelineStart: number; timelineEnd: number }[]
  }[]
  otherForms: { title: string; forms: { label: string; value: string; description: string }[] }[]
  popularMistakes: string[]
}

export function watchVocabularySourceId(mediaId: string, startMs: number, text: string) {
  return `watch:${mediaId}:${startMs}:${text.trim().toLocaleLowerCase("en-US")}`
}
