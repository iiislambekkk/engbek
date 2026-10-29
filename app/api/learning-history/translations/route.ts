import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import type { Prisma } from "@/app/generated/prisma"

export const runtime = "nodejs"

const schema = z.object({ text: z.string().trim().min(1).max(500), context: z.string().max(10000), source: z.object({ type: z.enum(["WATCH", "READ", "VOCABULARY"]), title: z.string().trim().min(1).max(300), url: z.string().url().optional(), id: z.string().max(500).optional(), locationLabel: z.string().max(100).optional(), locationValue: z.number().int().optional(), locationAnchor: z.string().max(2000).optional() }), explanation: z.record(z.string(), z.unknown()), chat: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(40).default([]) })

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid translation entry." }, { status: 400 })
  const { text, context, source, explanation, chat } = parsed.data
  const entry = await prisma.translationEntry.create({ data: { userId: session.user.id, text, context, sourceType: source.type, sourceTitle: source.title, sourceUrl: source.url, sourceId: source.id, locationLabel: source.locationLabel, locationValue: source.locationValue, locationAnchor: source.locationAnchor, explanation: explanation as Prisma.InputJsonValue, chat } })
  return Response.json({ entry })
}

export async function PATCH(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ id: z.string().min(1), chat: schema.shape.chat }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid chat history." }, { status: 400 })
  const result = await prisma.translationEntry.updateMany({ where: { id: parsed.data.id, userId: session.user.id }, data: { chat: parsed.data.chat } })
  return result.count ? Response.json({ ok: true }) : Response.json({ error: "Translation not found." }, { status: 404 })
}
