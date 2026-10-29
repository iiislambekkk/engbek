import {headers} from "next/headers"
import {VocabularyPage as VocabularyContent} from "@/components/vocabulary-page"
import {VocabularyEmptyState} from "@/components/vocabulary-empty-state"
import {auth} from "@/lib/auth"
import {prisma} from "@/lib/prisma"
import type { GrammarData } from "@/lib/vocabulary/types"

export default async function VocabularyPage() {
    const session = await auth.api.getSession({headers: await headers()})
    if (!session?.user) return null
    const [total, items, markedItems, translationEntries] = await Promise.all([
        prisma.vocabularyItem.count({where: {userId: session.user.id}}),
        prisma.vocabularyItem.findMany({
            where: {userId: session.user.id}, orderBy: {updatedAt: "desc"}, take: 100,
            select: {
                id: true,
                term: true,
                type: true,
                phonetic: true,
                pronunciation: true,
                familiarity: true,
                createdAt: true,
                updatedAt: true,
                notes: true,
                grammar: true,
                meanings: {
                    orderBy: {createdAt: "asc"},
                    select: {
                        id: true,
                        definition: true,
                        translation: true,
                        partOfSpeech: true,
                        examples: {select: {id: true, text: true, sourceTitle: true, sourceUrl: true}, orderBy: {createdAt: "asc"}}
                    }
                },
                chat: { select: { messages: true } },
                tags: {select: {tag: {select: {name: true}}}}
            },
        }),
        prisma.markedItem.findMany({where: {userId: session.user.id}, orderBy: {createdAt: "desc"}, take: 100}),
        prisma.translationEntry.findMany({where: {userId: session.user.id}, orderBy: {updatedAt: "desc"}, take: 100}),
    ])

    const markedSourceIds = markedItems.map(item => `marked:${item.id}`)
    const savedMarkedSources = markedSourceIds.length ? await prisma.vocabularySource.findMany({
        where: { sourceId: { in: markedSourceIds }, vocabulary: { userId: session.user.id } },
        select: { sourceId: true, vocabulary: { select: { id: true, term: true } } },
    }) : []
    const vocabularyBySource = new Map<string, { id: string; term: string }[]>()
    for (const source of savedMarkedSources) {
        if (!source.sourceId) continue
        const entries = vocabularyBySource.get(source.sourceId) ?? []
        if (!entries.some(entry => entry.id === source.vocabulary.id)) entries.push(source.vocabulary)
        vocabularyBySource.set(source.sourceId, entries)
    }

    if (!items.length && !markedItems.length && !translationEntries.length) return <VocabularyEmptyState />
    return <VocabularyContent items={items.map(item => ({
        ...item,
        grammar: item.grammar as unknown as GrammarData | null,
        chat: item.chat ? { messages: item.chat.messages as unknown as { role: "user" | "assistant"; content: string }[] } : null,
    }))} total={total} markedItems={markedItems.map(item => ({ ...item, vocabularyEntries: vocabularyBySource.get(`marked:${item.id}`) ?? [] }))} translationEntries={translationEntries}/>
}
