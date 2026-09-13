export function normalizeVocabularyTerm(term: string): string {
    return term
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/\s+/g, " ")
}