import { generateText, Output } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { chatgptFetch } from "@/lib/ai/chatgpt-fetch"
import { getAiCredential } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const mediaId = new URL(request.url).searchParams.get("mediaId")
  if (!mediaId) return Response.json({ error: "Video not found." }, { status: 404 })
  const explanations = await prisma.watchExplanation.findMany({
    where: { userId: session.user.id, mediaId },
    orderBy: { updatedAt: "desc" },
    include: { line: { select: { text: true, startMs: true, endMs: true } }, media: { select: { title: true } } },
  })
  const entries = explanations.map(item => ({ id: item.id, text: item.text, context: item.context, explanation: item.explanation, chat: item.chat, updatedAt: item.updatedAt, sourceTitle: item.media?.title || "Watch", sourceType: "WATCH", locationLabel: "Playback", locationValue: item.line.startMs, line: item.line }))
  return Response.json({ explanations: entries }, { headers: { "Cache-Control": "no-store" } })
}

const explanationSchema = z.object({
  wordTranslation: z.string(),
  contextMeaning: z.string(),
  contextTranslation: z.string(),
  usage: z.string(),
  otherMeanings: z.array(z.object({
    meaning: z.string(),
    translation: z.string(),
    example: z.string(),
    exampleTranslation: z.string(),
  })).max(6),
  notes: z.string(),
})

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const parsed = z.object({ mediaId: z.string().min(1), lineId: z.string().min(1), text: z.string().trim().min(1).max(500) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid expression." }, { status: 400 })
  const { mediaId, lineId, text } = parsed.data
  const line = await prisma.watchLine.findFirst({ where: { id: lineId, track: { media: { id: mediaId, userId: session.user.id } } }, include: { track: true } })
  if (!line) return Response.json({ error: "Caption not found." }, { status: 404 })
  const contextLines = await prisma.watchLine.findMany({ where: { trackId: line.trackId, startMs: { lte: line.startMs } }, orderBy: { startMs: "desc" }, take: 5 })
  const context = contextLines.reverse().map(item => item.text).join("\n")
  const media = await prisma.watchMedia.findFirst({ where: { id: mediaId, userId: session.user.id }, select: { title: true, url: true } })
  if (!media) return Response.json({ error: "Video not found." }, { status: 404 })
  const contextHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(context))
    .then(buffer => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join(""))
  const saved = await prisma.watchExplanation.findUnique({ where: { userId_mediaId_lineId_text_contextHash: { userId: session.user.id, mediaId, lineId, text, contextHash } } })
  if (saved) return Response.json({ id: saved.id, explanation: saved.explanation, chat: saved.chat, cached: true, contextLines: contextLines.length })
  const credential = await getAiCredential(session.user.id)
  const model = createOpenAI({ apiKey: credential.token, fetch: credential.type === "chatgpt" ? chatgptFetch : undefined }).responses(
    credential.type === "chatgpt" ? (process.env.OPENAI_CHATGPT_MODEL || "gpt-5.4-mini") : "gpt-5.4-mini",
  )
  const { output } = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    output: Output.object({ schema: explanationSchema, name: "contextual_vocabulary_explanation" }),
    system: "You are an English tutor for an English learner. Write all explanations, usage notes, definitions, and examples in clear English. Write Russian only in wordTranslation, contextTranslation, translation, and exampleTranslation. Every other field must be in English. First explain the selected expression's sense in this dialogue and provide the full Russian translation of the subtitle. Then list its other common senses, each with a Russian equivalent and a natural English example with its Russian translation. Cover multiple common meanings instead of limiting the answer to the contextual sense. Keep uncommon or obsolete senses out. Never invent meanings or claim context that is not present.",
    prompt: `Selected English expression: ${text}\nCurrent subtitle: ${line.text}\nPrevious dialogue for context:\n${context}`,
  })
  const savedExplanation = await prisma.watchExplanation.upsert({
    where: { userId_mediaId_lineId_text_contextHash: { userId: session.user.id, mediaId, lineId, text, contextHash } },
    create: { userId: session.user.id, mediaId, lineId, text, contextHash, context, explanation: output, chat: [] },
    update: {},
  })
  await prisma.translationEntry.upsert({
    where: { id: `watch-translation:${savedExplanation.id}` },
    create: { id: `watch-translation:${savedExplanation.id}`, userId: session.user.id, text, context, sourceType: "WATCH", sourceTitle: media.title, sourceUrl: media.url, sourceId: mediaId, locationLabel: "Playback", locationValue: line.startMs, explanation: output, chat: [] , createdAt: savedExplanation.createdAt, updatedAt: savedExplanation.updatedAt },
    update: { explanation: output, updatedAt: savedExplanation.updatedAt },
  })
  return Response.json({ id: savedExplanation.id, explanation: savedExplanation.explanation, chat: savedExplanation.chat, cached: false, contextLines: contextLines.length })
}
