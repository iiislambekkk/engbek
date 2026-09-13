"use client"

import { LogOut, Sparkles, User } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { authClient } from "@/lib/auth-client"

import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const pageTitles = [
    { href: "/vocabulary", title: "Vocabulary" },
    { href: "/learning", title: "Learning" },
    { href: "/settings", title: "Settings" },
]

function getInitials(name: string) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("")
}

export function AppHeader() {
    const pathname = usePathname()
    const router = useRouter()

    const { data: session } = authClient.useSession()

    const currentPage =
        pageTitles.find(
            (page) =>
                pathname === page.href ||
                pathname.startsWith(`${page.href}/`)
        )?.title ?? "Lexi"

    const handleLogout = async () => {
        await authClient.signOut()

        router.push("/login")
        router.refresh()
    }

    const user = session?.user
    const userName = user?.name ?? "User"

    const generatedAvatar = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
        user?.id ?? "user"
    )}&backgroundType=gradientLinear`

    const avatarUrl = user?.image ?? generatedAvatar

    return (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />

            <Separator
                orientation="vertical"
                className="mr-2 h-4"
            />

            <span className="text-sm font-medium">
                {currentPage}
            </span>

            <div className="ml-auto flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    className="hidden cursor-pointer sm:flex"
                >
                    <Sparkles className="mr-2 size-4" />
                    Ask AI
                </Button>

                <ThemeToggle />

                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 cursor-pointer rounded-full p-0"
                            />
                        }
                    >
                        <Avatar className="size-8">
                            <AvatarImage
                                src={avatarUrl}
                                alt={userName}
                            />
                            <AvatarFallback>
                                {getInitials(userName) || (
                                    <User className="size-4" />
                                )}
                            </AvatarFallback>
                        </Avatar>

                        <span className="sr-only">
                            Profile
                        </span>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        align="end"
                        className="w-64"
                    >
                        <div className="flex items-center gap-3 px-2 py-2">
                            <Avatar className="size-10">
                                <AvatarImage
                                    src={avatarUrl}
                                    alt={userName}
                                />
                                <AvatarFallback>
                                    {getInitials(userName) || (
                                        <User className="size-4" />
                                    )}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex min-w-0 flex-col">
                                <span className="truncate text-sm font-medium">
                                    {userName}
                                </span>

                                <span className="truncate text-xs text-muted-foreground">
                                    {user?.email}
                                </span>
                            </div>
                        </div>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            onClick={handleLogout}
                            className="cursor-pointer"
                        >
                            <LogOut className="mr-2 size-4" />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    )
}