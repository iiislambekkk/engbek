import { tool } from "ai"
import { z } from "zod"

import {
    findVocabulary,
    addOrUpdateVocabulary,
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
            description: `
Add an English word or expression to the authenticated user's vocabulary.

This tool can also enrich an existing vocabulary item.

Never use this tool blindly.
Use findVocabulary first.

If the item already exists, the service will update the existing
item and add only missing meanings/examples.

Never create duplicate vocabulary items.
      `,

            inputSchema: z.object({
                term: z
                    .string()
                    .min(1)
                    .describe(
                        "English word or expression",
                    ),

                type: vocabularyTypeSchema,

                meanings: z.array(
                    z.object({
                        definition: z
                            .string()
                            .min(1)
                            .describe(
                                "English definition",
                            ),

                        translation: z
                            .string()
                            .optional()
                            .describe(
                                "Translation into the user's language",
                            ),

                        partOfSpeech:
                            partOfSpeechSchema.optional(),

                        examples: z
                            .array(z.string())
                            .default([]),
                    }),
                ),

                notes: z.string().optional(),

                tags: z
                    .array(z.string())
                    .default([]),
            }),

            execute: async ({
                                term,
                                type,
                                meanings,
                                notes,
                                tags,
                            }) => {
                return addOrUpdateVocabulary(
                    userId,
                    {
                        term,
                        type,
                        meanings,
                        notes,
                        tags,
                        reason:
                            "USER_REQUEST",
                    },
                )
            },
        }),
    }
}