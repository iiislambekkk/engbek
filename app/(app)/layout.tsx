import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { MobileNav } from "@/components/mobile-nav"
import { AiAssistant } from "@/components/ai/ai-assistant"
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar"
import {AiAssistantProvider} from "@/components/ai/ai-assistant-provider";

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
            <AiAssistantProvider>
                <AppSidebar />

                <SidebarInset>
                    <AppHeader />

                    <main className="flex-1">
                        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                            {children}
                        </div>
                    </main>
                </SidebarInset>

                <MobileNav />

                <AiAssistant />
            </AiAssistantProvider>
        </SidebarProvider>
    )
}
