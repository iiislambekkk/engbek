import "server-only"

import { generateText, Output } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

import { PartOfSpeech, Prisma, VocabularyAddReason, VocabularyType } from "@/app/generated/prisma"
import { chatgptFetch } from "@/lib/ai/chatgpt-fetch"
import { getAiCredential } from "@/lib/ai/credentials"
import { addOrUpdateVocabulary, findSimilarVocabulary, findVocabulary } from "@/lib/vocabulary/vocabulary-service"

const partOfSpeechSchema = z.enum(["NOUN", "VERB", "ADJECTIVE", "ADVERB", "PRONOUN", "PREPOSITION", "CONJUNCTION", "INTERJECTION", "DETERMINER", "OTHER"])
const tenseSchema = z.object({
  key: z.enum(["past", "present", "future"]),
  title: z.string(),
  aspects: z.array(z.object({
    name: z.string(),
    form: z.string(),
    description: z.string(),
    clues: z.array(z.string()).max(5),
    timelineStart: z.number().min(0).max(100),
    timelineEnd: z.number().min(0).max(100),
  })).max(4),
})

const entrySchema = z.object({
  term: z.string(),
  type: z.enum(["WORD", "PHRASE", "PHRASAL_VERB", "COLLOCATION", "IDIOM"]),
  phonetic: z.string(),
  contextualMeaning: z.string(),
  contextualTranslation: z.string(),
  contextualExamples: z.array(z.string()).min(2).max(4),
  partOfSpeech: partOfSpeechSchema,
  contextualMeaningIndex: z.number().int().nullable(),
  usage: z.object({
    nuance: z.string(),
    register: z.string(),
    commonPatterns: z.array(z.string()).max(8),
    examples: z.array(z.object({ sentence: z.string(), translation: z.string() })).min(2).max(4),
  }),
  grammar: z.object({
    verbForms: z.object({ base: z.string(), thirdPerson: z.string(), past: z.string(), pastParticiple: z.string(), ing: z.string() }),
    verbTenses: z.array(tenseSchema).max(3),
    otherForms: z.array(z.object({ title: z.string(), forms: z.array(z.object({ label: z.string(), value: z.string(), description: z.string() })).max(8) })).max(6),
    popularMistakes: z.array(z.string()).max(6),
  }),
  otherMeanings: z.array(z.object({
    definition: z.string(),
    translation: z.string(),
    partOfSpeech: partOfSpeechSchema,
    examples: z.array(z.string()).min(2).max(4),
  })).max(4),
})

const vocabularyTermAnalysisSchema = z.object({
  status: z.enum(["clear", "ambiguous"]),
  term: z.string().trim().min(1).max(120),
  type: z.enum(["WORD", "PHRASE", "PHRASAL_VERB", "COLLOCATION", "IDIOM"]),
  explanation: z.string().max(240),
  candidates: z.array(z.object({ term: z.string().trim().min(1).max(120), type: z.enum(["WORD", "PHRASE", "PHRASAL_VERB", "COLLOCATION", "IDIOM"]), explanation: z.string().max(180) })).max(4),
})

const vocabularySelectionSuggestionsSchema = z.object({
  suggestions: z.array(z.object({ term: z.string().trim().min(1).max(120), explanation: z.string().max(180) })).min(1).max(8),
})

export type VocabularyTermCandidate = z.infer<typeof vocabularyTermAnalysisSchema>["candidates"][number]

async function getVocabularyModel(userId: string) {
  const credential = await getAiCredential(userId)
  const model = createOpenAI({
    apiKey: credential.token,
    fetch: credential.type === "chatgpt" ? chatgptFetch : undefined,
  }).responses(credential.type === "chatgpt" ? (process.env.OPENAI_CHATGPT_MODEL || "gpt-5.4-mini") : "gpt-5.4-mini")
  return { credential, model }
}

export async function analyzeVocabularyTerm({ userId, term, context }: { userId: string; term: string; context?: string }) {
  const inputTerm = term.trim().replace(/\s+/g, " ")
  if (!inputTerm) throw new Error("Enter a word or phrase to add.")
  const { credential, model } = await getVocabularyModel(userId)
  const { output } = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    output: Output.object({ schema: vocabularyTermAnalysisSchema, name: "vocabulary_term_analysis" }),
    system: `You analyze an English expression a learner wants to save to a vocabulary dictionary. Pick the canonical, reusable headword or phrase, not the surface form. Normalize inflections, possessives, contractions, and punctuation when that is clearly correct (for example "pens" -> "pen", "pen's" in a possessive construction about one pen -> "pen", "running" as the verb -> "run"). Keep meaningful multiword expressions intact, including phrasal verbs, collocations and idioms. Use the supplied context to disambiguate. Return status clear and one term when there is one clearly best dictionary form. Return status ambiguous with 2-4 genuinely plausible candidates only when context cannot determine what the learner means; include the original expression among candidates when it remains a valid option. Never call a normal inflection ambiguous when there is an obvious lemma. Keep explanations concise.`,
    prompt: `Selected expression: ${inputTerm}\nContext (if available): ${context?.trim() || "Not provided"}`,
  })
  return { ...output, originalTerm: inputTerm }
}

export async function suggestVocabularySelections({ userId, text, context }: { userId: string; text: string; context?: string }) {
  const { credential, model } = await getVocabularyModel(userId)
  const { output } = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    output: Output.object({ schema: vocabularySelectionSuggestionsSchema, name: "vocabulary_selection_suggestions" }),
    system: "You help an English learner choose useful vocabulary from a sentence. Suggest 3-6 distinct words or expressions that appear in or are clearly expressed by the selected sentence. Prefer reusable dictionary forms, including meaningful phrases and phrasal verbs, over whole sentences or isolated function words. Keep each suggestion concise and explain its contextual meaning in one short English phrase. Do not select for the user; present alternatives.",
    prompt: `Sentence or selected text:\n${text}\n\nAdditional context:\n${context?.trim() || "Not provided"}`,
  })
  return output.suggestions
}

export type VocabularyContextSource = {
  title?: string
  url?: string
  id?: string
}

export async function addVocabularyFromContext({
  userId,
  term,
  context,
  guidance,
  tags = [],
  source,
  reason = VocabularyAddReason.AI_SUGGESTION,
}: {
  userId: string
  term: string
  context: string
  guidance?: string
  tags?: string[]
  source?: VocabularyContextSource
  reason?: VocabularyAddReason
}) {
  const analysis = await analyzeVocabularyTerm({ userId, term, context })
  if (analysis.status === "ambiguous") {
    return { status: "ambiguous" as const, originalTerm: analysis.originalTerm, candidates: analysis.candidates }
  }
  return createVocabularyEntryFromContext({ userId, term: analysis.term, context, guidance, tags, source, reason })
}

// Shared entry point for every mode that sends a learner-selected expression to Vocabulary.
export const addVocabularyFromSelection = addVocabularyFromContext

export async function createVocabularyEntryFromContext({
  userId,
  term,
  context,
  guidance,
  tags = [],
  source,
  reason = VocabularyAddReason.AI_SUGGESTION,
  allowSimilar = false,
}: {
  userId: string
  term: string
  context: string
  guidance?: string
  tags?: string[]
  source?: VocabularyContextSource
  reason?: VocabularyAddReason
  allowSimilar?: boolean
}) {
  if (!allowSimilar) {
    const similarItems = await findSimilarVocabulary(userId, term)
    if (similarItems.length) return { status: "similar" as const, term, similarItems }
  }
  const savedItems = await findVocabulary(userId, term)
  const savedMeanings = savedItems.flatMap(item => item.meanings.map(meaning => ({
    meaningId: meaning.id,
    term: item.term,
    definition: meaning.definition,
    translation: meaning.translation,
    partOfSpeech: meaning.partOfSpeech,
    examples: meaning.examples.map(example => example.text),
  }))).map((meaning, index) => ({ ...meaning, meaningIndex: index + 1 }))
  const { credential, model } = await getVocabularyModel(userId)

  const { output } = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    output: Output.object({ schema: entrySchema, name: "vocabulary_learning_entry" }),
    system: `You are a careful English vocabulary tutor creating a useful, information-rich dictionary entry for a Russian-speaking learner.

Write definitions, nuance, register, patterns, grammatical forms, and mistake guidance in clear, concise English. Write Russian only in translation fields. Prioritize the meaning in the supplied context, explain its nuance and tone, identify its part of speech, and give natural reusable patterns and common learner mistakes when relevant. Also provide 2-4 short usage examples with natural Russian translations to show common collocations or patterns; format them as separate useful sentences, not paraphrases of the selected source line.
For the contextual meaning, provide 2-4 distinct, natural English example sentences that all demonstrate this exact sense. Include the selected/source sentence among these examples when it is a complete usable example; do not make it the only example. For each additional meaning, provide 2-4 varied, natural English examples.
Return only genuinely distinct lexical meanings, not paraphrases, synonyms, intensity variations, or slightly different Russian translations of the same sense. Merge senses that differ only by context or nuance. Include 1-4 additional common meanings, prioritizing useful everyday senses; omit uncertain or rare senses. Compare each sense against the saved list and set contextualMeaningIndex to the 1-based index of a saved meaning only when it clearly has the same definition and usage. Otherwise set it to null and create a new contextual meaning. Never map by translation alone. Do not duplicate any saved meaning as an additional meaning.
For verbs, return base/third-person/past/past participle/-ing forms and the 12 tense-aspect combinations grouped into past, present, and future (Simple, Continuous, Perfect, Perfect Continuous). Each timeline uses percentages 0-100 from left to right; anchor past timelines before the event and present, and future timelines after the event and present. For nouns return number/countability forms when relevant; for adjectives/adverbs return comparative and superlative forms when they exist; for phrases, phrasal verbs, collocations, and idioms return useful variable slots, particle placement, or grammatical patterns. Do not fabricate irrelevant forms. Leave unused fields empty and lists empty. Separate popular mistakes into concise individual items.

Return the headword or phrase, its type, and IPA when known.`,
    prompt: `Selected expression: ${term}\nContext or learner-provided meaning and examples:\n${context}\nAdditional guidance:\n${guidance || "None"}\nExisting saved meanings (use meaningIndex to identify an exact matching sense):\n${JSON.stringify(savedMeanings)}`,
  })

  const existing = await findVocabulary(userId, output.term, output.type as VocabularyType)
  const usageNote = [
    output.usage.nuance && `Nuance: ${output.usage.nuance}`,
    output.usage.register && `Register: ${output.usage.register}`,
    output.usage.commonPatterns.length && `Common patterns:\n${output.usage.commonPatterns.map(pattern => `- ${pattern}`).join("\n")}`,
    output.usage.examples.length && `Examples:\n${output.usage.examples.map(example => `- ${example.sentence} | ${example.translation}`).join("\n")}`,
  ].filter(Boolean).join("\n\n")

  const savedContextMeaning = output.contextualMeaningIndex === null
    ? null
    : savedMeanings[output.contextualMeaningIndex - 1] ?? null
  const contextualExamples: (string | { text: string; sourceTitle?: string; sourceUrl?: string })[] = output.contextualExamples
    .map(text => text.trim())
    .filter(Boolean)
  const contextText = context.trim()
  const contextIndex = contextText ? contextualExamples.findIndex(example =>
    (typeof example === "string" ? example : example.text).trim().toLocaleLowerCase("en-US") === contextText.toLocaleLowerCase("en-US"),
  ) : -1
  const sourceExample = { text: contextText, sourceTitle: source?.title, sourceUrl: source?.url }
  if (contextText && contextIndex >= 0) contextualExamples[contextIndex] = sourceExample
  else if (contextText) contextualExamples.push(sourceExample)
  const contextualMeaning = savedContextMeaning ? {
      definition: savedContextMeaning.definition,
      translation: savedContextMeaning.translation ?? output.contextualTranslation,
      partOfSpeech: savedContextMeaning.partOfSpeech ?? output.partOfSpeech as PartOfSpeech,
      examples: contextualExamples,
    } : {
      definition: output.contextualMeaning,
      translation: output.contextualTranslation,
      partOfSpeech: output.partOfSpeech as PartOfSpeech,
      examples: contextualExamples,
    }
  const meanings = [
    contextualMeaning,
    ...output.otherMeanings.map(meaning => ({
      definition: meaning.definition,
      translation: meaning.translation,
      partOfSpeech: meaning.partOfSpeech as PartOfSpeech,
      examples: meaning.examples,
    })),
  ]

  const result = await addOrUpdateVocabulary(userId, {
    term: output.term,
    phonetic: output.phonetic || undefined,
    type: output.type as VocabularyType,
    meanings,
    grammar: output.grammar as Prisma.InputJsonValue,
    notes: usageNote || undefined,
    tags,
    reason,
    sourceId: source?.id,
  })

  return { ...result, status: "added" as const, alreadyInVocabulary: existing.length > 0, newContext: !savedContextMeaning }
}
