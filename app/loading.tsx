"use client"

import Image from "next/image"
import { useState } from "react"

const quotes = [
    "Сайт баяу емес. Сенің шыдамың жоқ.",
    "Loading деп қарап отырғанша, бірдеңе оқып алсаңшы.",
    "Сайтты күтпе. Ол да сені күтіп тұр.",
    "Сайт баяу. Сен одан да баяусың.",
    "Меніңше, сайт емес, сен қатып қалғансың.",
    "Сайт ашылмай жатыр. Сен де ашылмай отырсың.",
    "Сайт ашылғанша қартайып кететін сияқтымыз.",
    "Менің заманымда сайт ашылмаса, кітап ашатын.",
    "Бір күні сайт тез ашылады. Сол күні сен дайын бол.",
    "Мен кетейін. Сайт ашылғанда өзің кірерсің.",
    "Жарайды, күт. Бәлкім, бір күні ашылар.",
    "Сенің жылдамдығыңмен бір сөзді аптасына жаттаймыз."
]

function getRandomQuote() {
    return quotes[Math.floor(Math.random() * quotes.length)]
}

export default function Loading() {
    const [quote] = useState(getRandomQuote)

    return (
        <main className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden px-6 py-12">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
            </div>

            <div className="relative flex w-full max-w-2xl flex-col items-center text-center">

                <div className="relative mb-8 w-full max-w-[280px] sm:max-w-[340px] md:max-w-[420px] lg:max-w-[480px]">
                    <div className="absolute inset-0 -z-10 rounded-3xl bg-primary/10 blur-2xl" />

                    <Image
                        src="/ahmet.jpg"
                        alt="Ahmet"
                        width={600}
                        height={600}
                        priority
                        className="w-full rounded-3xl object-contain shadow-2xl"
                    />
                </div>

                <div className="mb-7 flex items-center gap-3">
                    <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />

                    <span className="text-sm font-medium text-muted-foreground">
                        Loading...
                    </span>
                </div>

                <div className="max-w-xl px-4">
                    <p className="text-lg font-medium leading-7 tracking-tight sm:text-xl sm:leading-8">
                        «{quote}»
                    </p>

                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <span className="h-px w-8 bg-border" />
                        <span>Ахмет</span>
                        <span className="h-px w-8 bg-border" />
                    </div>
                </div>
            </div>
        </main>
    )
}