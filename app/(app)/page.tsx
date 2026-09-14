import { headers } from "next/headers"
import { BookOpen, MessageCircle } from "lucide-react"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const typeLabels = {
    WORD: "Word", PHRASE: "Phrase", PHRASAL_VERB: "Phrasal verb",
    COLLOCATION: "Collocation", IDIOM: "Idiom",
} as const

export default async function VocabularyPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null

    const [total, items] = await Promise.all([
        prisma.vocabularyItem.count({ where: { userId: session.user.id } }),
        prisma.vocabularyItem.findMany({
            where: { userId: session.user.id },
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: {
                id: true, term: true, type: true, phonetic: true,
                meanings: {
                    take: 2, orderBy: { createdAt: "asc" },
                    select: { id: true, definition: true, translation: true },
                },
                tags: { select: { tag: { select: { name: true } } } },
            },
        }),
    ])

    return (
        <section className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-primary">Your library</p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight">Vocabulary</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {total === 0 ? "Start building your personal English vocabulary." : `${total} saved ${total === 1 ? "item" : "items"}`}
                    </p>
                </div>
                <Badge variant="outline" className="h-7 px-3">{total} total</Badge>
            </header>

            {items.length === 0 ? (
                <Card className="min-h-80 items-center justify-center text-center">
                    <CardHeader className="items-center">
                        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <BookOpen className="size-6" />
                        </div>
                        <CardTitle>Your vocabulary is empty</CardTitle>
                        <CardDescription className="max-w-sm">
                            Ask the AI assistant to explain a word, then save it here when it is useful to you.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MessageCircle className="size-4" /> Use the AI button in the lower-right corner to begin.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => (
                            <Card key={item.id} size="sm" className="gap-3">
                                <CardHeader className="gap-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <CardTitle className="truncate text-lg">{item.term}</CardTitle>
                                        <Badge variant="secondary">{typeLabels[item.type]}</Badge>
                                    </div>
                                    {item.phonetic && <CardDescription>{item.phonetic}</CardDescription>}
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {item.meanings.map((meaning) => (
                                        <div key={meaning.id}>
                                            <p className="text-sm">{meaning.definition}</p>
                                            {meaning.translation && <p className="text-sm text-muted-foreground">{meaning.translation}</p>}
                                        </div>
                                    ))}
                                    {item.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {item.tags.map(({ tag }) => <Badge key={tag.name} variant="outline">{tag.name}</Badge>)}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    {total > items.length && <p className="text-center text-sm text-muted-foreground">Showing the 50 most recently updated items.</p>}
                </>
            )}
        </section>
    )
}
