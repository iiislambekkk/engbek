import {
    ExampleSource,
    PartOfSpeech,
    VocabularyAddReason,
    VocabularyType,
    Prisma,
} from "@/app/generated/prisma"

import { prisma } from "@/lib/prisma"

function normalizeVocabularyTerm(term: string): string {
    return term.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")
}

export type VocabularyMeaningInput = {
    definition: string
    translation?: string
    partOfSpeech?: PartOfSpeech
    examples: (string | { text: string; sourceTitle?: string; sourceUrl?: string })[]
}

export type AddVocabularyInput = {
    term: string
    phonetic?: string
    type: VocabularyType
    meanings: VocabularyMeaningInput[]
    notes?: string
    grammar?: Prisma.InputJsonValue
    tags: string[]
    reason: VocabularyAddReason
    sourceId?: string
}

function normalizeText(value: string) {
    return value.trim().toLocaleLowerCase("en-US")
}

function exampleInput(value: VocabularyMeaningInput["examples"][number]) {
    return typeof value === "string" ? { text: value } : value
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

    // `normalizedTerm` is indexed together with `userId`. This intentionally
    // performs an exact lookup instead of reading a user's whole vocabulary
    // into application memory and filtering it there.
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
                    phonetic: input.phonetic?.trim() || null,
                    notes: input.notes ?? null,
                    grammar: input.grammar,

                    meanings: {
                        create: input.meanings.map((meaning) => ({
                            definition: meaning.definition.trim(),
                            translation:
                                meaning.translation?.trim() || null,
                            partOfSpeech:
                                meaning.partOfSpeech ?? null,

                            examples: { create: meaning.examples.map(exampleInput).filter(example => example.text.trim()).map(example => ({ text: example.text.trim(), source: example.sourceTitle ? ExampleSource.AI_EXTRACTED : ExampleSource.AI_GENERATED, sourceTitle: example.sourceTitle, sourceUrl: example.sourceUrl })) },
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
            if (input.grammar !== undefined) {
                await tx.vocabularyItem.update({ where: { id: item.id }, data: { grammar: input.grammar } })
            }
            if (input.phonetic?.trim() && item.phonetic !== input.phonetic.trim()) {
                await tx.vocabularyItem.update({
                    where: { id: item.id },
                    data: { phonetic: input.phonetic.trim() },
                })
            }
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
                                create: meaning.examples.map(exampleInput).filter(example => example.text.trim()).map(example => ({ text: example.text.trim(), source: example.sourceTitle ? ExampleSource.AI_EXTRACTED : ExampleSource.AI_GENERATED, sourceTitle: example.sourceTitle, sourceUrl: example.sourceUrl })),
                            },
                        },
                    })

                    addedMeaningCount += 1
                    addedExampleCount += meaning.examples.length

                    continue
                }

                for (const example of meaning.examples) {
                    const exampleData = exampleInput(example)
                    const normalizedExample = normalizeText(exampleData.text)

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
                                text: exampleData.text.trim(),
                                source: typeof example === "string" ? ExampleSource.AI_GENERATED : ExampleSource.AI_EXTRACTED,
                                sourceTitle: exampleData.sourceTitle,
                                sourceUrl: exampleData.sourceUrl,
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
                sourceId: input.sourceId,
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

export async function findSimilarVocabulary(userId: string, term: string) {
    const normalizedTerm = normalizeVocabularyTerm(term)
    if (!normalizedTerm || normalizedTerm.includes(" ")) return []

    // Catch common inflectional variants while keeping this deliberately
    // conservative: the learner can still choose to save a separate entry.
    const stems = new Set([normalizedTerm])
    if (normalizedTerm.length > 4 && normalizedTerm.endsWith("ies")) stems.add(`${normalizedTerm.slice(0, -3)}y`)
    if (normalizedTerm.length > 4 && normalizedTerm.endsWith("es")) stems.add(normalizedTerm.slice(0, -2))
    if (normalizedTerm.length > 3 && normalizedTerm.endsWith("s") && !normalizedTerm.endsWith("ss")) stems.add(normalizedTerm.slice(0, -1))
    if (normalizedTerm.length > 5 && normalizedTerm.endsWith("ing")) {
        const stem = normalizedTerm.slice(0, -3)
        stems.add(stem)
        stems.add(`${stem}e`)
        if (stem.length > 2 && stem.at(-1) === stem.at(-2)) stems.add(stem.slice(0, -1))
    }
    if (normalizedTerm.length > 4 && normalizedTerm.endsWith("ed")) {
        const stem = normalizedTerm.slice(0, -2)
        stems.add(stem)
        stems.add(`${stem}e`)
        if (stem.length > 2 && stem.at(-1) === stem.at(-2)) stems.add(stem.slice(0, -1))
    }
    if (normalizedTerm.length > 4 && normalizedTerm.endsWith("er")) stems.add(normalizedTerm.slice(0, -2))
    if (normalizedTerm.length > 5 && normalizedTerm.endsWith("est")) stems.add(normalizedTerm.slice(0, -3))

    const candidates = [...stems].filter(stem => stem.length >= 3 && stem !== normalizedTerm)
    if (!candidates.length) return []
    return prisma.vocabularyItem.findMany({
        where: { userId, type: VocabularyType.WORD, normalizedTerm: { in: candidates } },
        select: { id: true, term: true, type: true },
        take: 5,
    })
}
