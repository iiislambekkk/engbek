import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { MobileNav } from "@/components/mobile-nav"
import { WatchBottomSpacer } from "@/components/watch-bottom-spacer"
import { PwaInstall } from "@/components/pwa-install"
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar"

export default async function AppLayout({
                                            children,
                                        }: {
    children: React.ReactNode
}) {
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    if (!session) {
        redirect("/login")
    }

    return (
        <SidebarProvider>
                <AppSidebar />

                <SidebarInset>
                    <AppHeader />

                    <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        <div className="mx-auto w-full px-4 py-2 lg:py-4 sm:px-6 lg:px-8">
                            {children}

                            <WatchBottomSpacer />
                        </div>
                    </main>
                </SidebarInset>

                <MobileNav />

        </SidebarProvider>
    )
}
