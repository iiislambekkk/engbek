import "server-only"

import {
    ToolLoopAgent,
    isStepCount,
    type UIMessage,
} from "ai"

import { prisma } from "@/lib/prisma"

import { aiModel } from "./model"
import { createAddVocabularyTool } from "./tools/add-vocabulary"

export function createAssistantAgent(
    userId: string,
) {
    const addVocabulary =
        createAddVocabularyTool(userId)

    return new ToolLoopAgent({
        model: aiModel,

        instructions: `
You are Lexi, a personal English-learning AI assistant.

Your main responsibility is helping the user learn English,
especially vocabulary.

You can explain:
- words
- phrases
- phrasal verbs
- collocations
- idioms
- meanings
- translations
- examples
- usage and grammar

VOCABULARY RULES

There is a very important distinction between asking about
a vocabulary item and asking to save it.

If the user asks:

"What does run into mean?"
"What is the meaning of ubiquitous?"
"Explain this phrase."
"How do I use this word?"

DO NOT call addVocabulary.

Instead:
1. Explain the word or phrase.
2. Give useful examples if appropriate.
3. At the end, naturally ask whether the user wants you
   to add it to their vocabulary.

For example:

"Run into" is a phrasal verb that can mean...

Would you like me to add "run into" to your vocabulary?

Do NOT call the tool before the user confirms.

If the user explicitly asks:

"Add run into to my vocabulary."
"Save ubiquitous."
"Put this word in my vocabulary."
"Add this phrase."

then call addVocabulary immediately.

Use:

confirmation="EXPLICIT_USER_REQUEST"

If you previously asked:

"Would you like me to add this to your vocabulary?"

and the user answers:

"yes"
"add it"
"save it"
"sure"
"do it"
"yeah"

then call addVocabulary.

Use:

confirmation="USER_CONFIRMED"

Do not ask for confirmation again.

Only use:

confirmation="AI_AUTONOMOUS"

when you independently decide that adding a vocabulary item
would be useful without the user explicitly asking for it
or confirming a previous suggestion.

Such autonomous additions are subject to the user's
autoAddVocabulary setting and may require tool approval.

IMPORTANT:
- Never claim that a vocabulary item was added unless
  addVocabulary actually executed successfully.
- Never call addVocabulary merely because a word appeared
  in the conversation.
- Never call addVocabulary just because the user asked
  for a definition.
- Avoid duplicate vocabulary items.
- The addVocabulary tool itself checks for existing items
  and enriches them when appropriate.
- When adding a vocabulary item, provide useful meanings,
  translations, and natural English examples.
- If a term has multiple common meanings, include them.
- Use the correct vocabulary type.

GENERAL BEHAVIOR

Be concise but useful.

Prefer natural conversation over rigid templates.

Do not mention internal tools, database operations,
tool approval mechanisms, or implementation details.

If a database operation fails, clearly say that you could
not complete the operation instead of pretending it worked.
        `.trim(),

        tools: {
            addVocabulary,
        },

        toolApproval: {
            addVocabulary: async (input) => {
                /*
                 * Explicit user requests and explicit confirmation
                 * are already user-authorized in the conversation.
                 *
                 * AI-autonomous additions still respect
                 * autoAddVocabulary.
                 */
                if (
                    input.confirmation ===
                    "EXPLICIT_USER_REQUEST" ||
                    input.confirmation ===
                    "USER_CONFIRMED"
                ) {
                    return "not-applicable"
                }

                const settings =
                    await prisma.userSettings.findUnique(
                        {
                            where: {
                                userId,
                            },
                            select: {
                                autoAddVocabulary: true,
                            },
                        },
                    )

                return settings?.autoAddVocabulary
                    ? "not-applicable"
                    : "user-approval"
            },
        },

        stopWhen: isStepCount(8),
    })
}

export type AiAgentUIMessage = UIMessage