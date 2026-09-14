"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { Menu, Plus, X } from "lucide-react"

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import type { AiAgentUIMessage } from "@/lib/ai/agent"

import { useAiAssistant } from "./ai-assistant-provider"
import { AiChat } from "./ai-chat"
import { AiChatHistory } from "./ai-chat-history"

type Chat = {
    id: string
    title: string
    createdAt: string
    updatedAt: string
}

function useIsMobile() {
    return useSyncExternalStore(
        (onStoreChange) => {
            const query = window.matchMedia("(max-width: 767px)")
            query.addEventListener("change", onStoreChange)
            return () => query.removeEventListener("change", onStoreChange)
        },
        () => window.matchMedia("(max-width: 767px)").matches,
        () => false,
    )
}

export function AiAssistantPanel() {
    const { isOpen, close } = useAiAssistant()
    const isMobile = useIsMobile()
    const [chats, setChats] = useState<Chat[]>([])
    const [activeChatId, setActiveChatId] = useState<string | null>(null)
    const [activeMessages, setActiveMessages] = useState<AiAgentUIMessage[]>([])
    const [showMobileHistory, setShowMobileHistory] = useState(false)
    const [loading, setLoading] = useState(false)

    const loadChats = useCallback(async () => {
        const response = await fetch("/api/ai/chats", { cache: "no-store" })
        if (!response.ok) return null

        const data = await response.json() as Chat[]
        setChats(data)
        return data
    }, [])

    const createNewChat = useCallback(async () => {
        const response = await fetch("/api/ai/chats", { method: "POST" })
        if (!response.ok) return null

        const chat = await response.json() as Chat
        setChats((current) => [chat, ...current])
        setActiveChatId(chat.id)
        setActiveMessages([])
        setShowMobileHistory(false)
        return chat
    }, [])

    const loadChat = useCallback(async (chatId: string) => {
        setLoading(true)
        try {
            const response = await fetch(`/api/ai/chats/${encodeURIComponent(chatId)}`, {
                cache: "no-store",
            })
            if (!response.ok) return

            const data = await response.json()
            setActiveChatId(data.chat.id)
            setActiveMessages(data.messages ?? [])
            setChats((current) => current.map((chat) =>
                chat.id === data.chat.id ? { ...chat, ...data.chat } : chat,
            ))
            setShowMobileHistory(false)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!isOpen) return

        let cancelled = false
        void (async () => {
            const currentChats = await loadChats()
            if (cancelled || !currentChats) return

            if (currentChats.length === 0) {
                await createNewChat()
            } else if (!currentChats.some((chat) => chat.id === activeChatId)) {
                await loadChat(currentChats[0].id)
            }
        })()

        return () => { cancelled = true }
    }, [isOpen, activeChatId, createNewChat, loadChat, loadChats])

    const deleteChat = useCallback(async (chatId: string) => {
        const response = await fetch(`/api/ai/chats/${encodeURIComponent(chatId)}`, {
            method: "DELETE",
        })
        if (!response.ok) return

        const remaining = chats.filter((chat) => chat.id !== chatId)
        setChats(remaining)
        if (activeChatId !== chatId) return

        if (remaining.length > 0) {
            await loadChat(remaining[0].id)
        } else {
            await createNewChat()
        }
    }, [activeChatId, chats, createNewChat, loadChat])

    const activeTitle = chats.find((chat) => chat.id === activeChatId)?.title ?? "AI Assistant"
    const history = (
        <AiChatHistory
            chats={chats}
            activeChatId={activeChatId}
            onSelect={loadChat}
            onNew={createNewChat}
            onDelete={deleteChat}
        />
    )
    const chat = loading || !activeChatId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading…
        </div>
    ) : (
        <AiChat key={activeChatId} chatId={activeChatId} initialMessages={activeMessages} />
    )

    if (isMobile) {
        return (
            <Drawer open={isOpen} onOpenChange={(open) => !open && close()} showSwipeHandle>
                <DrawerContent className="h-dvh max-h-dvh rounded-none border-t bg-background">
                    <DrawerHeader className="border-b px-4 pb-3 pt-2">
                        <DrawerTitle className="flex items-center justify-between gap-2">
                            <span className="truncate">{showMobileHistory ? "Chats" : activeTitle}</span>
                            <div className="flex items-center gap-1">
                                <Button type="button" size="icon" variant="ghost" onClick={createNewChat}>
                                    <Plus className="size-4" /><span className="sr-only">New chat</span>
                                </Button>
                                <Button type="button" size="icon" variant="ghost" onClick={() => setShowMobileHistory((value) => !value)}>
                                    <Menu className="size-4" /><span className="sr-only">Show chats</span>
                                </Button>
                            </div>
                        </DrawerTitle>
                        <DrawerDescription className="sr-only">AI English learning assistant</DrawerDescription>
                    </DrawerHeader>
                    <div className="min-h-0 flex flex-1">{showMobileHistory ? history : chat}</div>
                </DrawerContent>
            </Drawer>
        )
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
            <SheetContent
                side="right"
                showCloseButton={false}
                className="!inset-0 !h-dvh !w-dvw !max-w-none border-0 gap-0 p-0 sm:!max-w-none"
            >
                <div className="grid h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="min-h-0 border-r">{history}</aside>
                    <main className="flex min-h-0 flex-col">
                        <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
                            <h2 className="truncate font-semibold">{activeTitle}</h2>
                            <div className="flex items-center gap-1">
                                <Button type="button" size="icon" variant="ghost" onClick={createNewChat}>
                                    <Plus className="size-4" /><span className="sr-only">New chat</span>
                                </Button>
                                <Button type="button" size="icon" variant="ghost" onClick={close}>
                                    <X className="size-4" /><span className="sr-only">Close assistant</span>
                                </Button>
                            </div>
                        </header>
                        {chat}
                    </main>
                </div>
            </SheetContent>
        </Sheet>
    )
}
