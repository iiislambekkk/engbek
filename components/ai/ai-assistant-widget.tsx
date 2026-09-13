"use client"

import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

import { useAiAssistant } from "./ai-assistant-provider"

export function AiAssistantWidget() {
    const { open } =
        useAiAssistant()

    return (
        <Button
            type="button"
            size="icon"
            onClick={open}
            className="
        fixed
        right-4
        bottom-20
        z-50
        size-12
        rounded-full
        shadow-lg
        lg:right-6
        lg:bottom-6
      "
        >
            <Sparkles className="size-5" />

            <span className="sr-only">
        Open AI Assistant
      </span>
        </Button>
    )
}