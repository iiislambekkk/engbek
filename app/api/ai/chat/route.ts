import { headers } from "next/headers"

import {
    createAgentUIStreamResponse,
} from "ai"

import type { UIMessage } from "ai"

import { auth } from "@/lib/auth"

import {
    getChat,
    saveChatMessages,
} from "@/lib/ai/chat-store"

import {
    createAssistantAgent,
} from "@/lib/ai/agent"

export const runtime = "nodejs"

export const maxDuration = 60

export async function POST(
    request: Request,
) {
    const session =
        await auth.api.getSession({
            headers: await headers(),
        })

    if (!session) {
        return new Response(
            "Unauthorized",
            {
                status: 401,
            },
        )
    }

    const body = await request.json()

    const chatId = body?.chatId

    const messages =
        body?.messages as UIMessage[]

    if (
        typeof chatId !== "string" ||
        !Array.isArray(messages)
    ) {
        return Response.json(
            {
                error: "Invalid request.",
            },
            {
                status: 400,
            },
        )
    }

    const chat = await getChat(
        session.user.id,
        chatId,
    )

    if (!chat) {
        return Response.json(
            {
                error: "Chat not found.",
            },
            {
                status: 404,
            },
        )
    }

    const agent =
        createAssistantAgent(
            session.user.id,
        )

    return createAgentUIStreamResponse({
        agent,
        uiMessages: messages,

        onEnd: async ({
                          messages: finalMessages,
                      }) => {
            await saveChatMessages(
                session.user.id,
                chatId,
                finalMessages,
            )
        },

        onError: () =>
            "Something went wrong while processing the request.",
    })
}