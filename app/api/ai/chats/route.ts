import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import {
    createChat,
    getChats,
} from "@/lib/ai/chat-store"

export const runtime = "nodejs"

export async function GET(
    request: Request,
) {
    const session =
        await auth.api.getSession({
            headers: request.headers,
        })

    if (!session?.user) {
        return NextResponse.json(
            {
                error: "Unauthorized",
            },
            {
                status: 401,
            },
        )
    }

    const chats = await getChats(
        session.user.id,
    )

    return NextResponse.json(chats)
}

export async function POST(
    request: Request,
) {
    const session =
        await auth.api.getSession({
            headers: request.headers,
        })

    if (!session?.user) {
        return NextResponse.json(
            {
                error: "Unauthorized",
            },
            {
                status: 401,
            },
        )
    }

    const chat = await createChat(
        session.user.id,
    )

    return NextResponse.json(chat, {
        status: 201,
    })
}