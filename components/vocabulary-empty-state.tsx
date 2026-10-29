import Link from "next/link"
import { ArrowUpRight, BookOpen } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export function VocabularyEmptyState() {
  return (
    <section className="space-y-6 sm:space-y-8">
      <header>
        <p className="text-sm font-medium text-primary">Your library</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Vocabulary</h1>
      </header>

      <div className="relative isolate overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.07] shadow-sm">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 z-0 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 grid min-h-[340px] items-center gap-8 p-6 sm:p-10 md:min-h-[380px] md:grid-cols-[minmax(0,1fr)_180px] md:gap-10 md:p-12">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center md:mx-0 md:items-start md:text-left">
            <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-primary/10 bg-background/80 text-primary shadow-sm sm:size-16">
              <BookOpen className="size-7 sm:size-8" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your word library</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Start your word collection</h2>
            <p className="mt-3 max-w-md text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
              Save words and phrases while watching. They will appear here with explanations and examples for review.
            </p>
            <Link href="/watch" className={buttonVariants({ size: "lg", className: "mt-6 w-full gap-2 sm:w-auto" })}>
              Open Watch
              <ArrowUpRight className="size-4 opacity-70" />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">Your saved words will appear here.</p>
          </div>

          <div aria-hidden="true" className="mx-auto hidden w-full max-w-[180px] md:block">
            <div className="relative flex aspect-square items-center justify-center rounded-[2rem] border border-primary/10 bg-background/60 shadow-inner">
              <div className="absolute left-5 top-5 size-2 rounded-full bg-primary/30" />
              <div className="absolute bottom-7 right-6 size-3 rounded-full bg-primary/20" />
              <div className="flex size-24 items-center justify-center rounded-[1.75rem] bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <BookOpen className="size-11" strokeWidth={1.5} />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">one word at a time</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
