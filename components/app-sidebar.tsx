"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    BookOpen,
    GraduationCap,
    Settings,
    Sparkles,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
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
        href: "/vocabulary",
        icon: BookOpen,
    },
    {
        title: "Learning",
        href: "/learning",
        icon: GraduationCap,
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

            {/* Settings */}
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            render={
                                <Link href="/settings" />
                            }
                            isActive={pathname.startsWith("/settings")}
                            tooltip="Settings"
                            className="cursor-pointer"
                        >
                            <Settings />
                            <span>Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}