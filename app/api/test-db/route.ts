import { prisma } from "@/lib/prisma"

export async function GET() {
    try {
        const result = await prisma.$queryRaw`SELECT 1`

        return Response.json({
            ok: true,
            result,
        })
    } catch (error) {
        console.error(error)

        return Response.json(
            {
                ok: false,
                error: String(error),
            },
            { status: 500 }
        )
    }
}