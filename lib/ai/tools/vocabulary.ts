import { tool } from "ai"
import { z } from "zod"

import { findVocabulary } from "@/lib/vocabulary/vocabulary-service"

const vocabularyTypeSchema = z.enum([
    "WORD",
    "PHRASE",
    "PHRASAL_VERB",
    "COLLOCATION",
    "IDIOM",
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
    }
}
