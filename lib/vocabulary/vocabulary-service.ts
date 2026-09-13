import {
    ExampleSource,
    PartOfSpeech,
    Prisma,
    VocabularyAddReason,
    VocabularyType,
} from "@/app/generated/prisma"

import { prisma } from "@/lib/prisma"

import { normalizeVocabularyTerm } from "@/lib/ai/normalize"

export type VocabularyMeaningInput = {
    definition: string
    translation?: string
    partOfSpeech?: PartOfSpeech
    examples: string[]
}

export type AddVocabularyInput = {
    term: string
    type: VocabularyType
    meanings: VocabularyMeaningInput[]
    notes?: string
    tags: string[]
    reason: VocabularyAddReason
}

function normalizeText(value: string) {
    return value.trim().toLocaleLowerCase("en-US")
}

function meaningExists(
    definition: string,
    translation: string | undefined,
    existing: {
        definition: string
        translation: string | null
    },
) {
    return (
        normalizeText(existing.definition) === normalizeText(definition) &&
        normalizeText(existing.translation ?? "") ===
        normalizeText(translation ?? "")
    )
}

export async function findVocabulary(
    userId: string,
    term: string,
    type?: VocabularyType,
) {
    const normalizedTerm = normalizeVocabularyTerm(term)

    return prisma.vocabularyItem.findMany({
        where: {
            userId,
            normalizedTerm,
            ...(type ? { type } : {}),
        },
        include: {
            meanings: {
                include: {
                    examples: true,
                },
            },
            tags: {
                include: {
                    tag: true,
                },
            },
        },
    })
}

export async function addOrUpdateVocabulary(
    userId: string,
    input: AddVocabularyInput,
) {
    const normalizedTerm = normalizeVocabularyTerm(input.term)

    return prisma.$transaction(async (tx) => {
        let item = await tx.vocabularyItem.findUnique({
            where: {
                userId_normalizedTerm_type: {
                    userId,
                    normalizedTerm,
                    type: input.type,
                },
            },
            include: {
                meanings: {
                    include: {
                        examples: true,
                    },
                },
                tags: {
                    include: {
                        tag: true,
                    },
                },
            },
        })

        let created = false
        let addedMeaningCount = 0
        let addedExampleCount = 0

        if (!item) {
            item = await tx.vocabularyItem.create({
                data: {
                    userId,
                    term: input.term.trim(),
                    normalizedTerm,
                    type: input.type,
                    notes: input.notes ?? null,

                    meanings: {
                        create: input.meanings.map((meaning) => ({
                            definition: meaning.definition.trim(),
                            translation:
                                meaning.translation?.trim() || null,
                            partOfSpeech:
                                meaning.partOfSpeech ?? null,

                            examples: {
                                create: meaning.examples
                                    .map((example) => example.trim())
                                    .filter(Boolean)
                                    .map((text) => ({
                                        text,
                                        source: ExampleSource.AI_GENERATED,
                                    })),
                            },
                        })),
                    },
                },

                include: {
                    meanings: {
                        include: {
                            examples: true,
                        },
                    },
                    tags: {
                        include: {
                            tag: true,
                        },
                    },
                },
            })

            created = true

            addedMeaningCount = input.meanings.length

            addedExampleCount = input.meanings.reduce(
                (total, meaning) => total + meaning.examples.length,
                0,
            )
        } else {
            if (input.notes?.trim()) {
                const currentNotes = item.notes?.trim() ?? ""

                if (!currentNotes.includes(input.notes.trim())) {
                    await tx.vocabularyItem.update({
                        where: {
                            id: item.id,
                        },
                        data: {
                            notes: currentNotes
                                ? `${currentNotes}\n${input.notes.trim()}`
                                : input.notes.trim(),
                        },
                    })
                }
            }

            for (const meaning of input.meanings) {
                const existingMeaning = item.meanings.find(
                    (existing) =>
                        meaningExists(
                            meaning.definition,
                            meaning.translation,
                            existing,
                        ),
                )

                if (!existingMeaning) {
                    await tx.meaning.create({
                        data: {
                            vocabularyId: item.id,
                            definition: meaning.definition.trim(),
                            translation:
                                meaning.translation?.trim() || null,
                            partOfSpeech:
                                meaning.partOfSpeech ?? null,

                            examples: {
                                create: meaning.examples
                                    .map((example) => example.trim())
                                    .filter(Boolean)
                                    .map((text) => ({
                                        text,
                                        source: ExampleSource.AI_GENERATED,
                                    })),
                            },
                        },
                    })

                    addedMeaningCount += 1
                    addedExampleCount += meaning.examples.length

                    continue
                }

                for (const example of meaning.examples) {
                    const normalizedExample =
                        normalizeText(example)

                    const alreadyExists =
                        existingMeaning.examples.some(
                            (existingExample) =>
                                normalizeText(existingExample.text) ===
                                normalizedExample,
                        )

                    if (!alreadyExists && normalizedExample) {
                        await tx.example.create({
                            data: {
                                meaningId: existingMeaning.id,
                                text: example.trim(),
                                source: ExampleSource.AI_GENERATED,
                            },
                        })

                        addedExampleCount += 1
                    }
                }
            }

            item = await tx.vocabularyItem.findUniqueOrThrow({
                where: {
                    id: item.id,
                },
                include: {
                    meanings: {
                        include: {
                            examples: true,
                        },
                    },
                    tags: {
                        include: {
                            tag: true,
                        },
                    },
                },
            })
        }

        for (const tagName of input.tags) {
            const name = tagName.trim()

            if (!name) {
                continue
            }

            const tag = await tx.tag.upsert({
                where: {
                    userId_name: {
                        userId,
                        name,
                    },
                },
                create: {
                    userId,
                    name,
                },
                update: {},
            })

            await tx.vocabularyItemTag.upsert({
                where: {
                    vocabularyId_tagId: {
                        vocabularyId: item.id,
                        tagId: tag.id,
                    },
                },
                create: {
                    vocabularyId: item.id,
                    tagId: tag.id,
                },
                update: {},
            })
        }

        await tx.vocabularySource.create({
            data: {
                vocabularyId: item.id,
                reason: input.reason,
            },
        })

        return {
            success: true,
            created,
            vocabularyId: item.id,
            term: item.term,
            type: item.type,
            addedMeaningCount,
            addedExampleCount,
        }
    })
}