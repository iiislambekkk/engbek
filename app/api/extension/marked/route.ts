import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ text: z.string().trim().min(1).max(500), context: z.string().max(10000).default(""), url: z.string().url().max(2000), title: z.string().trim().min(1).max(300) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid selection." }, { status: 400 })
  const { text, context, url, title } = parsed.data
  const item = await prisma.markedItem.create({ data: { userId: session.user.id, kind: text.trim().split(/\s+/).length > 1 ? "EXPRESSION" : "WORD", text, context, sourceType: "READ", sourceTitle: title, sourceUrl: url } })
  return Response.json({ item })
}
