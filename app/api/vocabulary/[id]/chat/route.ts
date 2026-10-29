import { generateText, Output } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"

import { ExampleSource, PartOfSpeech } from "@/app/generated/prisma"
import { auth } from "@/lib/auth"
import { chatgptFetch } from "@/lib/ai/chatgpt-fetch"
import { getAiCredential } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

const partOfSpeechSchema = z.enum([
  "NOUN", "VERB", "ADJECTIVE", "ADVERB", "PRONOUN", "PREPOSITION",
  "CONJUNCTION", "INTERJECTION", "DETERMINER", "OTHER",
])
const grammarSchema = z.object({
  verbForms: z.object({ base: z.string(), thirdPerson: z.string(), past: z.string(), pastParticiple: z.string(), ing: z.string() }),
  verbTenses: z.array(z.object({
    key: z.enum(["past", "present", "future"]), title: z.string(),
    aspects: z.array(z.object({ name: z.string(), form: z.string(), description: z.string(), clues: z.array(z.string()), timelineStart: z.number(), timelineEnd: z.number() })),
  })),
  otherForms: z.array(z.object({ title: z.string(), forms: z.array(z.object({ label: z.string(), value: z.string(), description: z.string() })) })),
  popularMistakes: z.array(z.string()),
})
const changeSchema = z.object({
  type: z.enum(["add_meaning", "update_meaning", "delete_meaning", "add_example", "update_example", "delete_example", "replace_usage", "replace_grammar", "update_word"]),
  definition: z.string().nullable(),
  translation: z.string().nullable(),
  partOfSpeech: partOfSpeechSchema.nullable(),
  examples: z.array(z.string()),
  meaningIndex: z.number().int().nullable(),
  exampleIndex: z.number().int().nullable(),
  text: z.string().nullable(),
  notes: z.string().nullable(),
  grammar: grammarSchema.nullable(),
  term: z.string().nullable(),
  phonetic: z.string().nullable(),
  pronunciation: z.string().nullable(),
})
const assistantOutputSchema = z.object({
  answer: z.string().trim().min(1).max(12000),
  changes: z.array(changeSchema).max(5),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const { id } = await params
  const parsed = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Invalid message." }, { status: 400 })

  const item = await prisma.vocabularyItem.findFirst({
    where: { id, userId: session.user.id },
    include: { meanings: { include: { examples: true }, orderBy: { createdAt: "asc" } } },
  })
  if (!item) return Response.json({ error: "Vocabulary item not found." }, { status: 404 })
  const explanations = await prisma.watchExplanation.findMany({
    where: { userId: session.user.id, text: { contains: item.term } },
    orderBy: { updatedAt: "desc" }, take: 8, include: { media: { select: { title: true } } },
  })
  const chat = await prisma.vocabularyChat.findUnique({ where: { vocabularyId: item.id } })
  const chatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]), content: z.string().max(10000),
    
  })
  const messages = z.array(chatMessageSchema).max(40).parse(chat?.messages ?? [])
  const credential = await getAiCredential(session.user.id)
  const model = createOpenAI({
    apiKey: credential.token,
    fetch: credential.type === "chatgpt" ? chatgptFetch : undefined,
  }).responses(credential.type === "chatgpt" ? (process.env.OPENAI_CHATGPT_MODEL || "gpt-5.4-mini") : "gpt-5.4-mini")

  const generation = await generateText({
    model,
    providerOptions: credential.type === "chatgpt" ? { openai: { store: false } } : undefined,
    output: Output.object({ schema: assistantOutputSchema, name: "vocabulary_tutor_response" }),
    system: `You are an English vocabulary tutor and a careful editor for the learner's saved entry.
Answer in the same language as the learner. Write the answer as natural Markdown, choosing the structure that best explains this specific question. Use short headings, bold emphasis, compact lists, tables for comparisons, or blockquotes only when useful. Keep it readable and appropriately concise; do not force a fixed template into simple answers. Use natural examples and translations when they clarify meaning.
For an explicit edit request, choose the operation that matches the requested section exactly. The structured change fields are always present: use null for irrelevant scalar fields, [] for unused examples, and null for unused grammar.
The learner may explicitly ask you to change this saved entry. Only then return changes:
- For a request to add another meaning, return add_meaning with a concise English definition, a natural Russian translation, part of speech, and up to two useful natural example sentences.
- For a request to add, update, or delete a meaning use add_meaning, update_meaning, or delete_meaning. Existing meaningIndex values are 1-based. update_meaning changes only requested definition, translation, or part-of-speech fields.
- For examples use add_example, update_example, or delete_example. Provide the 1-based meaningIndex and, for updates/deletions, the 1-based exampleIndex shown below.
- If the learner asks to change/update/rewrite How to use it, always use replace_usage with the complete replacement notes in the Nuance / Register / Common patterns / Examples format. Never interpret this as adding an example to a meaning.
- If the learner asks to add usage examples to How to use it, put them under an Examples: heading in notes. Each line must use “- English sentence | Russian translation”. Keep these separate from examples attached to individual meanings.
- For grammar, verb forms, mistakes, or tense guidance use replace_grammar with the complete updated grammar object, preserving unaffected data.
- For spelling, phonetic transcription, or pronunciation use update_word; only change the requested fields and use an empty string to clear an optional text field.
- When asked to improve/reorganize the whole entry, you may return multiple targeted changes for the relevant sections.
- If the request is only a question or asks for a suggestion, do not change data. Explain the suggestion and let the learner decide.
Never invent a change the learner did not ask for. Never modify unrelated sections or delete content unless explicitly asked. If the request is only a question or suggestion, make no changes. Explain applied changes briefly and return an empty changes array when no edit is requested.`,
    prompt: `Word: ${item.term}
Saved meanings (use these 1-based numbers for add_example): ${JSON.stringify(item.meanings.map((meaning, index) => ({ meaningIndex: index + 1, definition: meaning.definition, translation: meaning.translation, partOfSpeech: meaning.partOfSpeech, examples: meaning.examples.map(example => example.text) })))}
Usage notes: ${item.notes || "None"}
Grammar/forms/mistakes: ${JSON.stringify(item.grammar ?? null)}
Word details: ${JSON.stringify({ term: item.term, phonetic: item.phonetic, pronunciation: item.pronunciation, type: item.type })}
Watch explanations: ${JSON.stringify(explanations.map(entry => ({ title: entry.media.title, context: entry.context, explanation: entry.explanation })))}
Conversation:
${messages.map(message => `${message.role}: ${message.content}`).join("\n")}
user: ${parsed.data.message}`,
  }).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  )
  if (!generation.ok) {
    console.error("Vocabulary assistant generation failed:", generation.error)
    return Response.json({ error: "The assistant could not create a reply. Please try again." }, { status: 502 })
  }

  const parsedOutput = assistantOutputSchema.safeParse(generation.value.output)
  if (!parsedOutput.success) {
    console.error("Vocabulary assistant returned an invalid structured response:", parsedOutput.error)
    return Response.json({ error: "The assistant returned an unreadable reply. Please try again." }, { status: 502 })
  }
  const output = parsedOutput.data
  const appliedChanges: { label: string; text: string }[] = []
  let updatedNotes = item.notes
  let updatedGrammar: unknown = item.grammar
  let updatedTerm = item.term
  let updatedPhonetic = item.phonetic
  let updatedPronunciation = item.pronunciation
  for (const change of output.changes) {
    if (change.type === "replace_usage") {
      if (change.notes === null) continue
      updatedNotes = change.notes.trim() || null
      appliedChanges.push({ label: "How to use it", text: "Usage guide updated" })
      continue
    }
    if (change.type === "replace_grammar") {
      if (change.grammar === null) continue
      updatedGrammar = change.grammar
      appliedChanges.push({ label: "Grammar", text: "Grammar and forms updated" })
      continue
    }
    if (change.type === "update_word") {
      if (change.term?.trim()) updatedTerm = change.term.trim()
      if (change.phonetic !== null) updatedPhonetic = change.phonetic.trim() || null
      if (change.pronunciation !== null) updatedPronunciation = change.pronunciation.trim() || null
      appliedChanges.push({ label: "Word details", text: "Word details updated" })
      continue
    }
    if (change.type === "add_meaning") {
      if (!change.definition || !change.partOfSpeech) continue
      await prisma.meaning.create({
        data: {
          vocabularyId: item.id,
          definition: change.definition,
          translation: change.translation,
          partOfSpeech: change.partOfSpeech as PartOfSpeech,
          examples: { create: change.examples.map(text => ({ text, source: ExampleSource.AI_GENERATED })) },
        },
      })
      appliedChanges.push({
        label: change.translation || "New meaning",
        text: `${change.definition}${change.examples.length ? ` Ã‚Â· ${change.examples.length} ${change.examples.length === 1 ? "example" : "examples"} added` : ""}`,
      })
      continue
    }

    if (change.type === "update_meaning" || change.type === "delete_meaning") {
      if (!change.meaningIndex) continue
      const meaning = item.meanings[change.meaningIndex - 1]
      if (!meaning) continue
      if (change.type === "delete_meaning") {
        await prisma.meaning.delete({ where: { id: meaning.id } })
        appliedChanges.push({ label: "Meaning removed", text: meaning.translation || meaning.definition })
      } else {
        const data = {
          ...(change.definition !== null ? { definition: change.definition } : {}),
          ...(change.translation !== null ? { translation: change.translation || null } : {}),
          ...(change.partOfSpeech !== null ? { partOfSpeech: change.partOfSpeech as PartOfSpeech } : {}),
        }
        if (!Object.keys(data).length) continue
        await prisma.meaning.update({ where: { id: meaning.id }, data })
        appliedChanges.push({ label: "Meaning updated", text: change.translation || change.definition || meaning.translation || meaning.definition })
      }
      continue
    }

    if (!change.meaningIndex) continue
    const meaning = item.meanings[change.meaningIndex - 1]
    if (!meaning) continue
    if (change.type === "delete_example" || change.type === "update_example") {
      if (!change.exampleIndex) continue
      const example = meaning.examples[change.exampleIndex - 1]
      if (!example) continue
      if (change.type === "delete_example") {
        await prisma.example.delete({ where: { id: example.id } })
        appliedChanges.push({ label: "Example removed", text: example.text })
      } else if (change.text?.trim()) {
        await prisma.example.update({ where: { id: example.id }, data: { text: change.text.trim() } })
        appliedChanges.push({ label: "Example updated", text: change.text.trim() })
      }
      continue
    }
    if (!change.text?.trim()) continue
    const alreadyExists = meaning.examples.some(example => example.text.trim().toLocaleLowerCase("en-US") === change.text.toLocaleLowerCase("en-US"))
    if (alreadyExists) continue
    await prisma.example.create({ data: { meaningId: meaning.id, text: change.text, source: ExampleSource.AI_GENERATED } })
    appliedChanges.push({ label: `Example - meaning ${change.meaningIndex}`, text: change.text })
  }

  if (updatedNotes !== item.notes || JSON.stringify(updatedGrammar) !== JSON.stringify(item.grammar) || updatedTerm !== item.term || updatedPhonetic !== item.phonetic || updatedPronunciation !== item.pronunciation) {
    const normalizedTerm = updatedTerm.toLocaleLowerCase("en-US").replace(/\s+/g, " ")
    const duplicate = updatedTerm !== item.term ? await prisma.vocabularyItem.findFirst({
      where: { userId: session.user.id, type: item.type, normalizedTerm, id: { not: item.id } },
      select: { id: true },
    }) : null
    if (duplicate) {
      updatedTerm = item.term
      appliedChanges.push({ label: "Word spelling unchanged", text: "An entry with that spelling already exists." })
    }
    await prisma.vocabularyItem.update({
      where: { id: item.id },
      data: { notes: updatedNotes, grammar: updatedGrammar as never, term: updatedTerm, normalizedTerm: updatedTerm.toLocaleLowerCase("en-US").replace(/\s+/g, " "), phonetic: updatedPhonetic, pronunciation: updatedPronunciation },
    })
  }

  const assistantReply = appliedChanges.length > 0
    ? `${output.answer}\n\n**Updated vocabulary**\n${appliedChanges.map(change => `- **${change.label}:** ${change.text}`).join("\n")}`
    : output.answer
  const updatedMessages = [
    ...messages,
    { role: "user" as const, content: parsed.data.message },
    { role: "assistant" as const, content: assistantReply },
  ].slice(-40)
  await prisma.vocabularyChat.upsert({
    where: { vocabularyId: item.id },
    create: { vocabularyId: item.id, messages: updatedMessages },
    update: { messages: updatedMessages },
  })

  const updatedItem = await prisma.vocabularyItem.findUniqueOrThrow({
    where: { id: item.id },
    select: {
      notes: true, grammar: true, term: true, phonetic: true, pronunciation: true,
      meanings: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, definition: true, translation: true, partOfSpeech: true,
          examples: { select: { id: true, text: true, sourceTitle: true, sourceUrl: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  })

  return Response.json({ messages: updatedMessages, meanings: updatedItem.meanings, notes: updatedItem.notes, grammar: updatedItem.grammar, term: updatedItem.term, phonetic: updatedItem.phonetic, pronunciation: updatedItem.pronunciation })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi." }, { status: 401 })
  const { id } = await params
  const item = await prisma.vocabularyItem.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!item) return Response.json({ error: "Vocabulary item not found." }, { status: 404 })
  await prisma.vocabularyChat.deleteMany({ where: { vocabularyId: item.id } })
  return Response.json({ cleared: true })
}
