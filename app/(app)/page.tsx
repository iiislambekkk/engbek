import { headers } from "next/headers"
import { BookOpen, MessageCircle } from "lucide-react"
import { VocabularyPage as VocabularyContent } from "@/components/vocabulary-page"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function VocabularyPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    const [total, items] = await Promise.all([
        prisma.vocabularyItem.count({ where: { userId: session.user.id } }),
        prisma.vocabularyItem.findMany({
            where: { userId: session.user.id }, orderBy: { updatedAt: "desc" }, take: 100,
            select: { id: true, term: true, type: true, phonetic: true, pronunciation: true, familiarity: true, createdAt: true, updatedAt: true, notes: true, meanings: { orderBy: { createdAt: "asc" }, select: { id: true, definition: true, translation: true, examples: { select: { id: true, text: true }, orderBy: { createdAt: "asc" } } } }, tags: { select: { tag: { select: { name: true } } } } },
        }),
    ])
    if (!items.length) return <section className="space-y-6"><header><p className="text-sm font-medium text-primary">Your library</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Vocabulary</h1></header><Card className="min-h-80 items-center justify-center text-center"><CardHeader className="items-center"><div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><BookOpen className="size-6" /></div><CardTitle>Your vocabulary is empty</CardTitle><CardDescription className="max-w-sm">Ask the AI assistant to explain a word, then save it here when it is useful to you.</CardDescription></CardHeader><CardContent className="flex items-center gap-2 text-sm text-muted-foreground"><MessageCircle className="size-4" /> Use the AI button in the lower-right corner to begin.</CardContent></Card></section>
    return <VocabularyContent items={items} total={total} />
}
