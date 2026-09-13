import { headers } from "next/headers"

import { auth } from "@/lib/auth"

import { getChat } from "@/lib/ai/chat-store"

export async function GET(
    _request: Request,
    {
        params,
    }: {
        params: Promise<{
            chatId: string
        }>
    },
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

    const { chatId } = await params

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

    return Response.json({
        chat: {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        },

        messages: chat.messages.map(
            (message) => message.message,
        ),
    })
}