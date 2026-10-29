import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { chatgptFetch } from "@/lib/ai/chatgpt-fetch"
import { getAiCredential } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const input = z.object({ explanationId: z.string().min(1), message: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null))
  if (!input.success) return Response.json({ error: "Invalid message." }, { status: 400 })
  const entry = await prisma.watchExplanation.findFirst({ where: { id: input.data.explanationId, userId: session.user.id } })
  if (!entry) return Response.json({ error: "Translation not found." }, { status: 404 })
  const chat = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(40).parse(entry.chat)
  const credential = await getAiCredential(session.user.id)
  const model = createOpenAI({ apiKey: credential.token, fetch: credential.type === "chatgpt" ? chatgptFetch : undefined }).responses(
    credential.type === "chatgpt" ? (process.env.OPENAI_CHATGPT_MODEL || "gpt-5.4-mini") : "gpt-5.4-mini",
  )
  const result = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    system: "You are an English tutor. Explain and chat in clear English. Use Russian only when providing a translation. Keep the discussion grounded in the selected expression and subtitle context. Do not add the expression to vocabulary unless explicitly asked.",
    prompt: `Video subtitle context:\n${entry.context}\nSelected expression: ${entry.text}\nOriginal explanation: ${JSON.stringify(entry.explanation)}\n\nConversation so far:\n${chat.map(item => `${item.role}: ${item.content}`).join("\n")}\nuser: ${input.data.message}\nassistant:`,
  })
  const updatedChat = [...chat, { role: "user" as const, content: input.data.message }, { role: "assistant" as const, content: result.text }]
  await prisma.watchExplanation.update({ where: { id: entry.id }, data: { chat: updatedChat } })
  await prisma.translationEntry.updateMany({ where: { id: `watch-translation:${entry.id}`, userId: session.user.id }, data: { chat: updatedChat } })
  return Response.json({ chat: updatedChat })
}
