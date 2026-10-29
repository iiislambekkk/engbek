import { headers } from "next/headers"
import { notFound } from "next/navigation"

import { VocabularyWordPage } from "@/components/vocabulary-word-page"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { GrammarData } from "@/lib/vocabulary/types"
import type { VocabularyChatMessage } from "@/lib/vocabulary/chat"

export default async function VocabularyItemPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) notFound()

    const { id } = await params
    const item = await prisma.vocabularyItem.findFirst({
        where: { id, userId: session.user.id },
        select: {
            id: true, term: true, type: true, phonetic: true, pronunciation: true,
            familiarity: true, createdAt: true, updatedAt: true, notes: true, grammar: true,
            meanings: {
                orderBy: { createdAt: "asc" },
                select: {
                    id: true, definition: true, translation: true, partOfSpeech: true,
                    examples: {
                        select: { id: true, text: true, sourceTitle: true, sourceUrl: true },
                        orderBy: { createdAt: "asc" },
                    },
                },
            },
            chat: { select: { messages: true } },
            tags: { select: { tag: { select: { name: true } } } },
        },
    })

    if (!item) notFound()

    return (
        <VocabularyWordPage
            item={{
                ...item,
                grammar: item.grammar as unknown as GrammarData | null,
                chat: item.chat
                    ? { messages: item.chat.messages as unknown as VocabularyChatMessage[] }
                    : null,
            }}
        />
    )
}
