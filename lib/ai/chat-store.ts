import "server-only"

import type { UIMessage } from "ai"

import { prisma } from "@/lib/prisma"

function extractText(message: UIMessage): string {
    return message.parts
        .filter(
            (
                part,
            ): part is Extract<
                UIMessage["parts"][number],
                { type: "text" }
            > => part.type === "text",
        )
        .map((part) => part.text)
        .join(" ")
        .trim()
}

export async function createChat(
    userId: string,
    title = "New chat",
) {
    return prisma.chat.create({
        data: {
            userId,
            title,
        },
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
        },
    })
}

export async function getChats(userId: string) {
    return prisma.chat.findMany({
        where: {
            userId,
        },
        orderBy: {
            updatedAt: "desc",
        },
        take: 100,
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    messages: true,
                },
            },
        },
    })
}

export async function getChat(
    userId: string,
    chatId: string,
) {
    return prisma.chat.findFirst({
        where: {
            id: chatId,
            userId,
        },
        include: {
            messages: {
                orderBy: {
                    position: "asc",
                },
            },
        },
    })
}

export async function saveChatMessages(
    userId: string,
    chatId: string,
    messages: UIMessage[],
) {
    const chat = await prisma.chat.findFirst({
        where: {
            id: chatId,
            userId,
        },
        select: {
            id: true,
            title: true,
        },
    })

    if (!chat) {
        throw new Error("Chat not found")
    }

    const serializedMessages = messages.map(
        (message) =>
            JSON.parse(
                JSON.stringify(message),
            ),
    )

    const firstUserMessage = messages.find(
        (message) => message.role === "user",
    )

    const firstUserText = firstUserMessage
        ? extractText(firstUserMessage)
        : ""

    const newTitle =
        chat.title === "New chat" &&
        firstUserText
            ? firstUserText.slice(0, 80)
            : chat.title

    await prisma.$transaction(async (tx) => {
        /*
         * UIMessage[] is the source of truth for the
         * current chat history.
         *
         * We replace the persisted message list atomically
         * instead of upserting individual messages.
         *
         * This prevents position conflicts when the AI SDK
         * changes/extends a message containing tool calls,
         * approvals, or multiple steps.
         */
        await tx.chatMessage.deleteMany({
            where: {
                chatId,
            },
        })
        if (serializedMessages.length > 0) {
            await tx.chatMessage.createMany({
                data: serializedMessages.map(
                    (message, position) => ({
                        chatId,
                        externalId:
                            `${messages[position].id}-${position}`,
                        role:
                        messages[position].role,
                        message,
                        position,
                    }),
                ),
            })
        }

        await tx.chat.update({
            where: {
                id: chatId,
            },
            data: {
                title: newTitle,
                updatedAt: new Date(),
            },
        })
    })
}