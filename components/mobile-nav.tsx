"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    BookOpen,
} from "lucide-react"

const navigation = [
    {
        title: "Vocabulary",
        href: "/",
        icon: BookOpen,
    },
]

export function MobileNav() {
    const pathname = usePathname()

    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur lg:hidden">
            <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
                {navigation.map((item) => {
                    const Icon = item.icon

                    const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex min-w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md py-1.5 text-xs transition-colors ${
                                active
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground"
                            }`}
                        >
                            <Icon
                                className={`size-5 ${
                                    active ? "stroke-[2.5]" : ""
                                }`}
                            />

                            <span>{item.title}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
