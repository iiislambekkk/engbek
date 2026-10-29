import Link from "next/link"
import { BookOpen, MonitorPlay } from "lucide-react"

export default function HomePage() {
    return (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8 sm:py-16">
            <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Engbek</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome home</h1>
                <p className="max-w-xl text-muted-foreground">Choose where you want to continue learning English.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <Link href="/vocabulary" className="group rounded-xl border bg-card p-6 transition-colors hover:bg-accent">
                    <BookOpen className="mb-5 size-6 text-primary" />
                    <h2 className="font-semibold">Vocabulary</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Review saved words, translations, and notes.</p>
                </Link>
                <Link href="/watch" className="group rounded-xl border bg-card p-6 transition-colors hover:bg-accent">
                    <MonitorPlay className="mb-5 size-6 text-primary" />
                    <h2 className="font-semibold">Watch</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Practice English with videos and saved expressions.</p>
                </Link>
            </div>
        </section>
    )
}
