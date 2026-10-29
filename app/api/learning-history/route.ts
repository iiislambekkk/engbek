import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const url = new URL(request.url)
  const [marked, translations] = await Promise.all([
    prisma.markedItem.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.translationEntry.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ])
  return Response.json({ marked, translations, sourceType: url.searchParams.get("source") || "ALL" }, { headers: { "Cache-Control": "no-store" } })
}

const sourceType = z.enum(["WATCH", "READ", "VOCABULARY"])
const source = z.object({ type: sourceType, title: z.string().trim().min(1).max(300), url: z.string().url().optional(), id: z.string().max(500).optional(), locationLabel: z.string().max(100).optional(), locationValue: z.number().int().optional(), locationAnchor: z.string().max(2000).optional() })

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ kind: z.enum(["WORD", "EXPRESSION", "LINE"]), text: z.string().trim().min(1).max(5000), context: z.string().max(10000).default(""), source }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid marked item." }, { status: 400 })
  const { kind, text, context, source: origin } = parsed.data
  const item = await prisma.markedItem.create({ data: { userId: session.user.id, kind, text, context, sourceType: origin.type, sourceTitle: origin.title, sourceUrl: origin.url, sourceId: origin.id, locationLabel: origin.locationLabel, locationValue: origin.locationValue, locationAnchor: origin.locationAnchor } })
  return Response.json({ item })
}

export async function DELETE(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return Response.json({ error: "Item not found." }, { status: 400 })
  const result = await prisma.markedItem.deleteMany({ where: { id, userId: session.user.id } })
  if (!result.count) return Response.json({ error: "Item not found." }, { status: 404 })
  if (id.startsWith("watch-line:") || id.startsWith("legacy-watch-line:")) {
    const lineId = id.replace(/^(legacy-watch-line:|watch-line:)/, "")
    await prisma.watchLine.updateMany({ where: { id: lineId, track: { media: { userId: session.user.id } } }, data: { bookmarked: false } })
  }
  if (id.startsWith("watch-expression:") || id.startsWith("legacy-watch-expression:")) {
    const expressionId = id.replace(/^(legacy-watch-expression:|watch-expression:)/, "")
    await prisma.watchExpression.deleteMany({ where: { id: expressionId, userId: session.user.id } })
  }
  return Response.json({ ok: true })
}
