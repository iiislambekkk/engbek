import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { Familiarity } from "@/app/generated/prisma"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const body = (await request.json()) as { familiarity?: Familiarity }
    const familiarity = body.familiarity
    if (!familiarity || !Object.values(Familiarity).includes(familiarity)) {
        return NextResponse.json({ error: "Invalid familiarity" }, { status: 400 })
    }

    const item = await prisma.vocabularyItem.updateMany({
        where: { id, userId: session.user.id },
        data: { familiarity },
    })
    if (!item.count) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ familiarity })
}
