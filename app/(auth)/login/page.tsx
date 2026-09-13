"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export default function LoginPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleGoogleLogin() {
        setLoading(true)
        setError(null)

        const { error } = await authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
        })

        if (error) {
            setError(error.message || "Something went wrong")
            setLoading(false)
        }
    }

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
            {/* Theme toggle */}
            <div className="absolute right-6 top-6">
                <ThemeToggle />
            </div>

            {/* Background decoration */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-32 -top-32 size-96 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5 sm:p-10">

                    {/* Logo */}
                    <div className="mb-8 flex flex-col items-center text-center">
                        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                            <Sparkles className="size-6" />
                        </div>

                        <h1 className="text-3xl font-bold tracking-tight">
                            Welcome to Lexi
                        </h1>

                        <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
                            Your personal English learning assistant.
                            Learn vocabulary, practice grammar, and improve
                            your English every day.
                        </p>
                    </div>

                    {/* Login */}
                    <div className="space-y-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-12 w-full cursor-pointer gap-3 text-sm font-medium transition-colors"
                            disabled={loading}
                            onClick={handleGoogleLogin}
                        >
                            {loading ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <svg
                                    className="size-4"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <path
                                        fill="#4285F4"
                                        d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.92-4.18 2.92-7.42Z"
                                    />
                                    <path
                                        fill="#34A853"
                                        d="M12 21.9c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.93-3.31.93-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.9Z"
                                    />
                                    <path
                                        fill="#FBBC05"
                                        d="M6.54 13.99a5.85 5.85 0 0 1 0-3.74V7.72H3.3a9.75 9.75 0 0 0 0 8.8l3.24-2.53Z"
                                    />
                                    <path
                                        fill="#EA4335"
                                        d="M12 6.22c1.43 0 2.72 0 3.73 1.46l2.8-2.8C16.84 3.28 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.7 5.32l3.24 2.53C7.31 7.94 9.46 6.22 12 6.22Z"
                                    />
                                </svg>
                            )}

                            {loading
                                ? "Redirecting..."
                                : "Continue with Google"}
                        </Button>

                        {error && (
                            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                                {error}
                            </p>
                        )}
                    </div>

                    <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
                        Continue with Google to start learning with Lexi.
                    </p>
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Lexi
                </p>
            </div>
        </main>
    )
}