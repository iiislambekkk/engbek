import "server-only"

import { tool } from "ai"
import { z } from "zod"

import {
    PartOfSpeech,
    VocabularyAddReason,
    VocabularyType,
} from "@/app/generated/prisma"
import {
    addOrUpdateVocabulary,
    findVocabulary,
} from "@/lib/vocabulary/vocabulary-service"

const vocabularyTypeSchema = z.enum([
    "WORD",
    "PHRASE",
    "PHRASAL_VERB",
    "COLLOCATION",
    "IDIOM",
])

const partOfSpeechSchema = z.enum([
    "NOUN",
    "VERB",
    "ADJECTIVE",
    "ADVERB",
    "PRONOUN",
    "PREPOSITION",
    "CONJUNCTION",
    "INTERJECTION",
    "DETERMINER",
    "OTHER",
])

export const addVocabularyInputSchema = z.object({
    term: z.string().trim().min(1).max(200),
    type: vocabularyTypeSchema,
    meanings: z.array(z.object({
        definition: z.string().trim().min(1).max(1000),
        translation: z.string().trim().max(500).optional(),
        partOfSpeech: partOfSpeechSchema.optional(),
        examples: z.array(z.string().trim().min(1).max(1000)).max(10).default([]),
    })).min(1).max(20),
    notes: z.string().trim().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    reason: z.enum(["USER_REQUEST", "AI_SUGGESTION", "AI_AUTO_ADD", "MANUAL"])
        .default("USER_REQUEST"),
    confirmation: z.enum([
        "EXPLICIT_USER_REQUEST",
        "USER_CONFIRMED",
        "AI_AUTONOMOUS",
    ]).default("EXPLICIT_USER_REQUEST"),
})

export function createVocabularyTools(
    userId: string,
) {
    return {
        findVocabulary: tool({
            description:
                "Search the authenticated user's vocabulary for an English word or expression. Always use this before adding vocabulary.",

            inputSchema: z.object({
                term: z
                    .string()
                    .min(1)
                    .describe(
                        "The English word or expression to search for",
                    ),

                type: vocabularyTypeSchema
                    .optional()
                    .describe(
                        "Vocabulary type if known",
                    ),
            }),

            execute: async ({ term, type }) => {
                const items = await findVocabulary(
                    userId,
                    term,
                    type,
                )

                return {
                    found: items.length > 0,
                    items: items.map((item) => ({
                        id: item.id,
                        term: item.term,
                        type: item.type,
                        familiarity: item.familiarity,
                        notes: item.notes,

                        meanings: item.meanings.map(
                            (meaning) => ({
                                id: meaning.id,
                                definition: meaning.definition,
                                translation:
                                meaning.translation,
                                partOfSpeech:
                                meaning.partOfSpeech,

                                examples:
                                    meaning.examples.map(
                                        (example) => ({
                                            id: example.id,
                                            text: example.text,
                                        }),
                                    ),
                            }),
                        ),

                        tags: item.tags.map(
                            ({ tag }) => tag.name,
                        ),
                    })),
                }
            },
        }),

        addVocabulary: tool({
            description: "Add or enrich one vocabulary item. Use findVocabulary first.",
            inputSchema: addVocabularyInputSchema,
            execute: async (input, { toolCallId }) => {
                const result = await addOrUpdateVocabulary(userId, {
                    term: input.term,
                    type: input.type as VocabularyType,
                    meanings: input.meanings.map((meaning) => ({
                        ...meaning,
                        partOfSpeech: meaning.partOfSpeech as PartOfSpeech | undefined,
                    })),
                    notes: input.notes,
                    tags: input.tags,
                    reason: input.reason as VocabularyAddReason,
                    sourceId: toolCallId,
                })

                return {
                    ...result,
                    action: result.created ? "created" : "updated",
                    message: result.created
                        ? `Added "${result.term}" to the user's vocabulary.`
                        : `Updated "${result.term}" in the user's vocabulary.`,
                }
            },
        }),
    }
}
