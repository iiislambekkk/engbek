"use client"

import type {
    AiAgentUIMessage,
} from "@/lib/ai/agent"

import { Button } from "@/components/ui/button"

import { Check, X } from "lucide-react"
import {AiAssistantMarkdown} from "@/components/ai/ai-assistant-markdown";

type Props = {
    message: AiAgentUIMessage

    onApprove: (
        approvalId: string,
    ) => void

    onDeny: (
        approvalId: string,
    ) => void
}

export function AiMessage({
                              message,
                              onApprove,
                              onDeny,
                          }: Props) {
    const isUser =
        message.role === "user"

    return (
        <div
            className={
                isUser
                    ? "flex justify-end"
                    : "flex justify-start"
            }
        >
            <div
                className={
                    isUser
                        ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary p-5 text-sm text-primary-foreground"
                        : "max-w-[90%] rounded-2xl rounded-bl-md bg-muted p-5 text-sm"
                }
            >
                {message.parts.map(
                    (part, index) => {
                        if (
                            part.type === "text"
                        ) {
                            return (
                                <div
                                    key={`${message.id}-${index}`}
                                    className={isUser ? "whitespace-pre-wrap" : undefined}
                                >
                                    <AiAssistantMarkdown content={part.text} />
                                </div>
                            )
                        }

                        if (
                            part.type ===
                            "tool-findVocabulary"
                        ) {
                            if (
                                part.state ===
                                "output-available"
                            ) {
                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="text-xs text-muted-foreground"
                                    >
                                        Vocabulary checked.
                                    </div>
                                )
                            }

                            if (
                                part.state ===
                                "input-streaming" ||
                                part.state ===
                                "input-available"
                            ) {
                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="text-xs text-muted-foreground"
                                    >
                                        Searching vocabulary…
                                    </div>
                                )
                            }

                            return null
                        }

                        if (
                            part.type ===
                            "tool-addVocabulary"
                        ) {
                            if (
                                part.state ===
                                "input-streaming" ||
                                part.state ===
                                "input-available"
                            ) {
                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="mt-2 text-xs text-muted-foreground"
                                    >
                                        Preparing vocabulary…
                                    </div>
                                )
                            }

                            if (
                                part.state ===
                                "approval-requested"
                            ) {
                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="mt-3 space-y-3 rounded-xl border bg-background p-3 text-foreground"
                                    >
                                        <div>
                                            <div className="font-medium">
                                                Add to vocabulary?
                                            </div>

                                            <div className="mt-1 text-sm text-muted-foreground">
                                                {(part.input as { term?: string }).term ?? "Vocabulary item"}
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() =>
                                                    onApprove(
                                                        part.approval.id,
                                                    )
                                                }
                                            >
                                                <Check className="mr-1 size-4" />
                                                Add
                                            </Button>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    onDeny(
                                                        part.approval.id,
                                                    )
                                                }
                                            >
                                                <X className="mr-1 size-4" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )
                            }

                            if (
                                part.state ===
                                "output-available"
                            ) {
                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="my-2 text-xs text-muted-foreground"
                                    >
                                        ✓ Vocabulary updated
                                    </div>
                                )
                            }

                            if (
                                part.state ===
                                "output-error"
                            ) {
                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="mt-2 text-xs text-destructive"
                                    >
                                        Failed to update vocabulary: {part.errorText}
                                    </div>
                                )
                            }

                            return null
                        }

                        return null
                    },
                )}
            </div>
        </div>
    )
}
