"use client"

import {
    createContext,
    useContext,
    useState,
} from "react"

type AiAssistantContextValue = {
    isOpen: boolean
    open: () => void
    close: () => void
    toggle: () => void
}

const AiAssistantContext =
    createContext<
        AiAssistantContextValue | undefined
    >(undefined)

export function AiAssistantProvider({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    const [isOpen, setIsOpen] =
        useState(false)

    return (
        <AiAssistantContext.Provider
            value={{
                isOpen,

                open() {
                    setIsOpen(true)
                },

                close() {
                    setIsOpen(false)
                },

                toggle() {
                    setIsOpen((value) => !value)
                },
            }}
        >
            {children}
        </AiAssistantContext.Provider>
    )
}

export function useAiAssistant() {
    const context =
        useContext(AiAssistantContext)

    if (!context) {
        throw new Error(
            "useAiAssistant must be used inside AiAssistantProvider",
        )
    }

    return context
}