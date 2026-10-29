"use client"

import { usePathname } from "next/navigation"

export function WatchBottomSpacer() {
    const pathname = usePathname()
    const isWatchRoute = pathname === "/watch" || pathname.startsWith("/watch/")

    if (isWatchRoute) {
        return null
    }

    return <div className="h-[40px] lg:h-0" />
}
