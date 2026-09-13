"use client"

import {
    Plus,
    Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"

type Chat = {
    id: string
    title: string
    createdAt: string
    updatedAt: string
}

type Props = {
    chats: Chat[]
    activeChatId: string | null

    onSelect: (
        chatId: string,
    ) => void

    onNew: () => void

    onDelete: (
        chatId: string,
    ) => void
}

export function AiChatHistory({
                                  chats,
                                  activeChatId,
                                  onSelect,
                                  onNew,
                                  onDelete,
                              }: Props) {
    return (
        <div className="flex h-full w-full flex-col bg-background">
            <div className="flex items-center justify-between border-b p-3">
        <span className="font-medium">
          Chats
        </span>

                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onNew}
                >
                    <Plus className="size-4" />

                    <span className="sr-only">
            New chat
          </span>
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {chats.length === 0 && (
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                        No chats yet.
                    </div>
                )}

                <div className="space-y-1">
                    {chats.map((chat) => (
                        <div
                            key={chat.id}
                            className={`
                group
                flex
                items-center
                gap-1
                rounded-lg
                transition-colors
                ${
                                activeChatId === chat.id
                                    ? "bg-muted"
                                    : "hover:bg-muted/60"
                            }
              `}
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    onSelect(chat.id)
                                }
                                className="min-w-0 flex-1 px-3 py-2 text-left text-sm"
                            >
                                <div className="truncate">
                                    {chat.title}
                                </div>
                            </button>

                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="mr-1 size-8 opacity-0 group-hover:opacity-100"
                                onClick={() =>
                                    onDelete(chat.id)
                                }
                            >
                                <Trash2 className="size-4 text-muted-foreground" />

                                <span className="sr-only">
                  Delete chat
                </span>
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}