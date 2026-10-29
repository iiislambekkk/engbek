import { z } from "zod"
import { auth } from "@/lib/auth"
import { isAllowedAppOrigin } from "@/lib/request-origin"
import { suggestVocabularySelections } from "@/lib/vocabulary/vocabulary-ai"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ text: z.string().trim().min(1).max(500), context: z.string().max(5000).optional() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid text for vocabulary suggestions." }, { status: 400 })
  try {
    const suggestions = await suggestVocabularySelections({ userId: session.user.id, text: parsed.data.text, context: parsed.data.context })
    return Response.json({ suggestions })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not suggest vocabulary choices." }, { status: 500 })
  }
}
