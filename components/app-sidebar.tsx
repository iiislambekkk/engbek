"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    BookOpen,
    Sparkles,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

const mainNavigation = [
    {
        title: "Vocabulary",
        href: "/",
        icon: BookOpen,
    },
]

export function AppSidebar() {
    const pathname = usePathname()

    return (
        <Sidebar collapsible="icon">
            {/* Logo */}
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            render={
                                <Link href="/" />
                            }
                            size="lg"
                            tooltip="Lexi"
                            className="cursor-pointer"
                        >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <Sparkles className="size-4" />
                            </div>

                            <span className="text-lg font-semibold tracking-tight">
                Lexi
              </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            {/* Navigation */}
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>
                        Main
                    </SidebarGroupLabel>

                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainNavigation.map((item) => {
                                const Icon = item.icon

                                const active =
                                    pathname === item.href ||
                                    pathname.startsWith(`${item.href}/`)

                                return (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            render={
                                                <Link href={item.href} />
                                            }
                                            isActive={active}
                                            tooltip={item.title}
                                            className="cursor-pointer"
                                        >
                                            <Icon />
                                            <span>{item.title}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

        </Sidebar>
    )
}
