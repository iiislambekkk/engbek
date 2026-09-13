"use client"

import {
    useCallback,
    useEffect,
    useState,
} from "react"

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"

import { Button } from "@/components/ui/button"

import {
    ArrowLeft,
    Plus,
} from "lucide-react"

import type {
    AiAgentUIMessage,
} from "@/lib/ai/agent"

import { useAiAssistant } from "./ai-assistant-provider"
import { AiChat } from "./ai-chat"
import { AiChatHistory } from "./ai-chat-history"

type Chat = {
    id: string
    title: string
    createdAt: string
    updatedAt: string
}

export function AiAssistantPanel() {
    const {
        isOpen,
        close,
    } = useAiAssistant()

    const [chats, setChats] =
        useState<Chat[]>([])

    const [
        activeChatId,
        setActiveChatId,
    ] = useState<string | null>(
        null,
    )

    const [
        activeMessages,
        setActiveMessages,
    ] = useState<
        AiAgentUIMessage[]
    >([])

    const [
        showHistory,
        setShowHistory,
    ] = useState(false)

    const [
        loading,
        setLoading,
    ] = useState(false)

    const loadChats =
        useCallback(async () => {
            const response = await fetch(
                "/api/ai/chats",
                {
                    cache: "no-store",
                },
            )

            if (!response.ok) {
                return null
            }

            const data =
                await response.json()

            setChats(data)

            return data as Chat[]
        }, [])

    const createNewChat =
        useCallback(async () => {
            const response = await fetch(
                "/api/ai/chats",
                {
                    method: "POST",
                },
            )

            if (!response.ok) {
                return null
            }

            const chat =
                await response.json()

            setChats((current) => [
                chat,
                ...current,
            ])

            setActiveChatId(chat.id)
            setActiveMessages([])
            setShowHistory(false)

            return chat
        }, [])

    const loadChat =
        useCallback(
            async (chatId: string) => {
                setLoading(true)

                try {
                    const response =
                        await fetch(
                            `/api/ai/chats/${encodeURIComponent(chatId)}`,
                            {
                                cache: "no-store",
                            },
                        )

                    if (!response.ok) {
                        return
                    }

                    const data =
                        await response.json()

                    /*
                     * /api/ai/chats/[chatId] returns:
                     *
                     * {
                     *   chat: {
                     *     id,
                     *     title,
                     *     ...
                     *   },
                     *   messages: [...]
                     * }
                     *
                     * So the chat ID is data.chat.id,
                     * not data.id.
                     */

                    setActiveChatId(
                        data.chat.id,
                    )

                    setActiveMessages(
                        data.messages ?? [],
                    )

                    setChats((current) =>
                        current.map(
                            (chat) =>
                                chat.id ===
                                data.chat.id
                                    ? {
                                        ...chat,
                                        title:
                                        data
                                            .chat
                                            .title,
                                        createdAt:
                                        data
                                            .chat
                                            .createdAt,
                                        updatedAt:
                                        data
                                            .chat
                                            .updatedAt,
                                    }
                                    : chat,
                        ),
                    )

                    setShowHistory(false)
                } finally {
                    setLoading(false)
                }
            },
            [],
        )

    useEffect(() => {
        if (!isOpen) {
            return
        }

        let cancelled = false

        async function initialize() {
            const currentChats =
                await loadChats()

            if (cancelled) {
                return
            }

            if (
                currentChats &&
                currentChats.length > 0
            ) {
                const currentActive =
                    currentChats.find(
                        (chat) =>
                            chat.id ===
                            activeChatId,
                    )

                if (!currentActive) {
                    await loadChat(
                        currentChats[0].id,
                    )
                }

                return
            }

            await createNewChat()
        }

        void initialize()

        return () => {
            cancelled = true
        }
    }, [
        isOpen,
        loadChats,
        loadChat,
        createNewChat,
        activeChatId,
    ])

    async function deleteChat(
        chatId: string,
    ) {
        const response = await fetch(
            `/api/ai/chats/${encodeURIComponent(chatId)}`,
            {
                method: "DELETE",
            },
        )

        if (!response.ok) {
            return
        }

        const remaining =
            chats.filter(
                (chat) =>
                    chat.id !== chatId,
            )

        setChats(remaining)

        if (activeChatId === chatId) {
            if (remaining.length > 0) {
                await loadChat(
                    remaining[0].id,
                )
            } else {
                await createNewChat()
            }
        }
    }

    return (
        <Sheet
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    close()
                }
            }}
        >
            <SheetContent
                side="right"
                className="
                    flex
                    w-full
                    flex-col
                    gap-0
                    p-0
                    sm:max-w-[480px]
                "
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>
                        AI Assistant
                    </SheetTitle>

                    <SheetDescription>
                        AI English learning assistant
                    </SheetDescription>
                </SheetHeader>

                {showHistory ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex items-center gap-2 border-b p-3">
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                    setShowHistory(
                                        false,
                                    )
                                }
                            >
                                <ArrowLeft className="size-4" />

                                <span className="sr-only">
                                    Back
                                </span>
                            </Button>

                            <span className="font-semibold">
                                Chat history
                            </span>
                        </div>

                        <AiChatHistory
                            chats={chats}
                            activeChatId={
                                activeChatId
                            }
                            onSelect={
                                loadChat
                            }
                            onNew={
                                createNewChat
                            }
                            onDelete={
                                deleteChat
                            }
                        />
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div className="min-w-0">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowHistory(
                                            true,
                                        )
                                    }
                                    className="max-w-[300px] truncate text-left text-sm font-semibold hover:underline"
                                >
                                    {chats.find(
                                            (chat) =>
                                                chat.id ===
                                                activeChatId,
                                        )?.title ??
                                        "AI Assistant"}
                                </button>
                            </div>

                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={
                                    createNewChat
                                }
                            >
                                <Plus className="size-4" />

                                <span className="sr-only">
                                    New chat
                                </span>
                            </Button>
                        </div>

                        {loading ||
                        !activeChatId ? (
                            <div className="flex flex-1 items-center justify-center">
                                <div className="text-sm text-muted-foreground">
                                    Loading…
                                </div>
                            </div>
                        ) : (
                            <AiChat
                                key={activeChatId}
                                chatId={
                                    activeChatId
                                }
                                initialMessages={
                                    activeMessages
                                }
                            />
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}