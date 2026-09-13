"use client"

import {
    useEffect,
    useRef,
    useState,
} from "react"

import {
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"

import { useChat } from "@ai-sdk/react"

import type {
    AiAgentUIMessage,
} from "@/lib/ai/agent"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import {
    ArrowUp,
    Loader2,
} from "lucide-react"

import { AiMessage } from "./ai-message"

type Props = {
    chatId: string
    initialMessages: AiAgentUIMessage[]
}

export function AiChat({
                           chatId,
                           initialMessages,
                       }: Props) {
    const [input, setInput] =
        useState("")

    const bottomRef =
        useRef<HTMLDivElement>(null)

    const {
        messages,
        sendMessage,
        addToolApprovalResponse,
        status,
        error,
    } = useChat<AiAgentUIMessage>({
        messages: initialMessages,

        transport:
            new DefaultChatTransport({
                api: "/api/ai/chat",

                body: {
                    chatId,
                },
            }),

        sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    })

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: "smooth",
        })
    }, [messages])

    function handleSubmit(
        event: React.FormEvent,
    ) {
        event.preventDefault()

        const text = input.trim()

        if (!text || status !== "ready") {
            return
        }

        sendMessage({
            text,
        })

        setInput("")
    }

    const isLoading =
        status === "submitted" ||
        status === "streaming"

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    {messages.length === 0 && (
                        <div className="flex min-h-[50vh] items-center justify-center">
                            <div className="text-center">
                                <div className="mb-3 text-3xl">
                                    ✦
                                </div>

                                <h3 className="font-semibold">
                                    AI Assistant
                                </h3>

                                <p className="mt-1 text-sm text-muted-foreground">
                                    Ask me anything about English
                                    or your vocabulary.
                                </p>
                            </div>
                        </div>
                    )}

                    {messages.map(
                        (message) => (
                            <AiMessage
                                key={message.id}
                                message={message}
                                onApprove={(approvalId) => {
                                    addToolApprovalResponse({
                                        id: approvalId,
                                        approved: true,
                                    })
                                }}
                                onDeny={(approvalId) => {
                                    addToolApprovalResponse({
                                        id: approvalId,
                                        approved: false,
                                    })
                                }}
                            />
                        ),
                    )}

                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2">
                                <Loader2 className="size-4 animate-spin" />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            Something went wrong.
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>
            </div>

            <div className="border-t bg-background p-3">
                <form
                    onSubmit={handleSubmit}
                    className="mx-auto flex max-w-3xl items-end gap-2"
                >
                    <Textarea
                        value={input}
                        onChange={(event) =>
                            setInput(
                                event.target.value,
                            )
                        }
                        onKeyDown={(event) => {
                            if (
                                event.key === "Enter" &&
                                !event.shiftKey
                            ) {
                                event.preventDefault()

                                handleSubmit(
                                    event,
                                )
                            }
                        }}
                        placeholder="Ask anything..."
                        disabled={isLoading}
                        className="max-h-32 min-h-10 resize-none"
                        rows={1}
                    />

                    <Button
                        type="submit"
                        size="icon"
                        disabled={
                            isLoading ||
                            !input.trim()
                        }
                    >
                        <ArrowUp className="size-4" />

                        <span className="sr-only">
              Send
            </span>
                    </Button>
                </form>
            </div>
        </div>
    )
}