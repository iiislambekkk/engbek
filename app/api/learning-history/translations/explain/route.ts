import { generateText, Output } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { chatgptFetch } from "@/lib/ai/chatgpt-fetch"
import { getAiCredential } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

const explanationSchema = z.object({ wordTranslation: z.string(), contextMeaning: z.string(), contextTranslation: z.string(), usage: z.string(), otherMeanings: z.array(z.object({ meaning: z.string(), translation: z.string(), example: z.string(), exampleTranslation: z.string() })).max(6), notes: z.string() })

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ markedItemId: z.string().min(1) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid marked item." }, { status: 400 })
  const marked = await prisma.markedItem.findFirst({ where: { id: parsed.data.markedItemId, userId: session.user.id } })
  if (!marked) return Response.json({ error: "Marked item not found." }, { status: 404 })
  const cached = await prisma.translationEntry.findFirst({ where: { userId: session.user.id, text: marked.text, context: marked.context, sourceType: marked.sourceType, sourceId: marked.sourceId, locationAnchor: marked.locationAnchor }, orderBy: { updatedAt: "desc" } })
  if (cached) return Response.json({ entry: cached })
  const credential = await getAiCredential(session.user.id)
  const model = createOpenAI({ apiKey: credential.token, fetch: credential.type === "chatgpt" ? chatgptFetch : undefined }).responses(credential.type === "chatgpt" ? (process.env.OPENAI_CHATGPT_MODEL || "gpt-5.4-mini") : "gpt-5.4-mini")
  const { output } = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    output: Output.object({ schema: explanationSchema, name: "contextual_vocabulary_explanation" }),
    system: "You are an English tutor for an English learner. Write explanations, usage notes, definitions, and examples in clear English. Write Russian only in translations. Explain the selected expression in its context, translate the context, and give other common senses. Never invent context.",
    prompt: `Selected English expression: ${marked.text}\nContext:\n${marked.context}`,
  })
  const entry = await prisma.translationEntry.create({ data: { userId: session.user.id, text: marked.text, context: marked.context, sourceType: marked.sourceType, sourceTitle: marked.sourceTitle, sourceUrl: marked.sourceUrl, sourceId: marked.sourceId, locationLabel: marked.locationLabel, locationValue: marked.locationValue, locationAnchor: marked.locationAnchor, explanation: output } })
  return Response.json({ entry })
}
