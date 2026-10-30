"use client"

import { usePathname } from "next/navigation"

export function WatchBottomSpacer() {
    const pathname = usePathname()
    const isWatchRoute = pathname === "/watch" || pathname.startsWith("/watch/")

    if (isWatchRoute) {
        return <span aria-hidden="true" data-watch-route className="hidden" />
    }

    return <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 lg:h-0" />
}
