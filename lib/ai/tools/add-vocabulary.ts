import "server-only"

import { tool } from "ai"
import { z } from "zod"

import {
    ExampleSource,
    Familiarity,
    PartOfSpeech,
    Prisma,
    VocabularyAddReason,
    VocabularyType,
} from "@/app/generated/prisma"

import { prisma } from "@/lib/prisma"

const normalize = (value: string) =>
    value
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/\s+/g, " ")

const vocabularyTypeSchema = z.enum([
    "WORD",
    "PHRASE",
    "PHRASAL_VERB",
    "COLLOCATION",
    "IDIOM",
])

const familiaritySchema = z.enum([
    "NEW",
    "LEARNING",
    "FAMILIAR",
    "MASTERED",
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

const vocabularyAddReasonSchema = z.enum([
    "USER_REQUEST",
    "AI_SUGGESTION",
    "AI_AUTO_ADD",
    "MANUAL",
])

export const addVocabularyInputSchema = z.object({
    term: z
        .string()
        .min(1)
        .max(200)
        .describe("The vocabulary term to add."),

    type: vocabularyTypeSchema.describe(
        "Vocabulary type: WORD, PHRASE, PHRASAL_VERB, COLLOCATION, or IDIOM.",
    ),

    meanings: z
        .array(
            z.object({
                definition: z
                    .string()
                    .min(1)
                    .max(1000),

                translation: z
                    .string()
                    .max(500)
                    .optional(),

                partOfSpeech: partOfSpeechSchema.optional(),

                examples: z
                    .array(
                        z
                            .string()
                            .min(1)
                            .max(1000),
                    )
                    .max(10)
                    .default([]),
            }),
        )
        .min(1)
        .max(20),

    phonetic: z
        .string()
        .max(200)
        .optional(),

    pronunciation: z
        .string()
        .max(500)
        .optional(),

    familiarity: familiaritySchema.optional(),

    notes: z
        .string()
        .max(2000)
        .optional(),

    tags: z
        .array(
            z
                .string()
                .min(1)
                .max(50),
        )
        .max(20)
        .optional(),

    reason: vocabularyAddReasonSchema
        .default("USER_REQUEST")
        .describe(
            "Why this vocabulary is being added.",
        ),

    confirmation: z
        .enum([
            "EXPLICIT_USER_REQUEST",
            "USER_CONFIRMED",
            "AI_AUTONOMOUS",
        ])
        .default("EXPLICIT_USER_REQUEST")
        .describe(
            "How the user authorized this vocabulary addition.",
        ),
})

export function createAddVocabularyTool(userId: string) {
    return tool({
        description: `
Add a vocabulary item to the user's vocabulary.

IMPORTANT:
- Use this tool ONLY when the user explicitly asked to add/save the vocabulary item,
  OR when the user explicitly confirmed your previous suggestion to add it.
- Do NOT use this tool merely because the user asked what a word or phrase means.
- If the user only asks for an explanation, answer the question and ask whether
  they want the term added to their vocabulary.
- If the user says "yes", "add it", "save it", or otherwise confirms that suggestion,
  use confirmation="USER_CONFIRMED".
- If the user explicitly says "add X", "save X", "put X in my vocabulary",
  use confirmation="EXPLICIT_USER_REQUEST".
- If the term already exists, enrich the existing item instead of creating a duplicate.
- Add missing meanings and missing examples to an existing vocabulary item.
        `.trim(),

        inputSchema: addVocabularyInputSchema,

        execute: async (input, { toolCallId }) => {
            const term = input.term.trim()
            const normalizedTerm = normalize(term)

            const candidates =
                await prisma.vocabularyItem.findMany({
                    where: {
                        userId,
                        type: input.type as VocabularyType,
                    },
                    include: {
                        meanings: {
                            include: {
                                examples: true,
                            },
                        },
                    },
                })

            const existing = candidates.find(
                (item) =>
                    normalize(item.term) ===
                    normalizedTerm,
            )

            const result =
                await prisma.$transaction(async (tx) => {
                    if (!existing) {
                        const created =
                            await tx.vocabularyItem.create({
                                data: {
                                    userId,
                                    term,
                                    type: input.type as VocabularyType,
                                    phonetic:
                                        input.phonetic ??
                                        null,
                                    pronunciation:
                                        input.pronunciation ??
                                        null,
                                    familiarity:
                                        (input.familiarity as Familiarity | undefined) ??
                                        Familiarity.NEW,
                                    notes:
                                        input.notes ?? null,

                                    meanings: {
                                        create: input.meanings.map(
                                            (meaning) => ({
                                                definition:
                                                    meaning.definition.trim(),

                                                translation:
                                                    meaning.translation?.trim() ??
                                                    null,

                                                partOfSpeech:
                                                    meaning.partOfSpeech
                                                        ? (meaning.partOfSpeech as PartOfSpeech)
                                                        : null,

                                                examples: {
                                                    create: meaning.examples.map(
                                                        (example) => ({
                                                            text: example.trim(),
                                                            source:
                                                            ExampleSource.AI_GENERATED,
                                                        }),
                                                    ),
                                                },
                                            }),
                                        ),
                                    },

                                    sources: {
                                        create: {
                                            reason:
                                                input.reason as VocabularyAddReason,
                                            sourceId:
                                            toolCallId,
                                        },
                                    },
                                },
                                include: {
                                    meanings: {
                                        include: {
                                            examples: true,
                                        },
                                    },
                                },
                            })

                        return {
                            item: created,
                            action: "created" as const,
                            addedMeanings:
                            input.meanings.length,
                            addedExamples:
                                input.meanings.reduce(
                                    (total, meaning) =>
                                        total +
                                        meaning.examples.length,
                                    0,
                                ),
                        }
                    }

                    let addedMeanings = 0
                    let addedExamples = 0

                    if (
                        input.phonetic !== undefined ||
                        input.pronunciation !== undefined ||
                        input.familiarity !== undefined ||
                        input.notes !== undefined
                    ) {
                        await tx.vocabularyItem.update({
                            where: {
                                id: existing.id,
                            },
                            data: {
                                ...(input.phonetic !== undefined && {
                                    phonetic:
                                    input.phonetic,
                                }),

                                ...(input.pronunciation !==
                                    undefined && {
                                        pronunciation:
                                        input.pronunciation,
                                    }),

                                ...(input.familiarity !==
                                    undefined && {
                                        familiarity:
                                            input.familiarity as Familiarity,
                                    }),

                                ...(input.notes !==
                                    undefined && {
                                        notes: input.notes,
                                    }),
                            },
                        })
                    }

                    for (const inputMeaning of input.meanings) {
                        const normalizedDefinition =
                            normalize(
                                inputMeaning.definition,
                            )

                        const existingMeaning =
                            existing.meanings.find(
                                (meaning) =>
                                    normalize(
                                        meaning.definition,
                                    ) ===
                                    normalizedDefinition,
                            )

                        if (!existingMeaning) {
                            await tx.meaning.create({
                                data: {
                                    vocabularyId:
                                    existing.id,

                                    definition:
                                        inputMeaning.definition.trim(),

                                    translation:
                                        inputMeaning.translation?.trim() ??
                                        null,

                                    partOfSpeech:
                                        inputMeaning.partOfSpeech
                                            ? (inputMeaning.partOfSpeech as PartOfSpeech)
                                            : null,

                                    examples: {
                                        create:
                                            inputMeaning.examples.map(
                                                (example) => ({
                                                    text: example.trim(),
                                                    source:
                                                    ExampleSource.AI_GENERATED,
                                                }),
                                            ),
                                    },
                                },
                            })

                            addedMeanings++
                            addedExamples +=
                                inputMeaning.examples.length

                            continue
                        }

                        for (const example of inputMeaning.examples) {
                            const normalizedExample =
                                normalize(example)

                            const alreadyExists =
                                existingMeaning.examples.some(
                                    (existingExample) =>
                                        normalize(
                                            existingExample.text,
                                        ) ===
                                        normalizedExample,
                                )

                            if (!alreadyExists) {
                                await tx.example.create({
                                    data: {
                                        meaningId:
                                        existingMeaning.id,
                                        text:
                                            example.trim(),
                                        source:
                                        ExampleSource.AI_GENERATED,
                                    },
                                })

                                addedExamples++
                            }
                        }
                    }

                    await tx.vocabularySource.create({
                        data: {
                            vocabularyId:
                            existing.id,

                            reason:
                                input.reason as VocabularyAddReason,

                            sourceId: toolCallId,
                        },
                    })

                    return {
                        item: existing,
                        action: "updated" as const,
                        addedMeanings,
                        addedExamples,
                    }
                })

            return {
                success: true,
                action: result.action,
                vocabularyId: result.item.id,
                term: result.item.term,
                addedMeanings:
                result.addedMeanings,
                addedExamples:
                result.addedExamples,
                message:
                    result.action === "created"
                        ? `Added "${result.item.term}" to the user's vocabulary.`
                        : `Updated "${result.item.term}" in the user's vocabulary.`,
            }
        },
    })
}