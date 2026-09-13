import "server-only"

import { createOpenAI } from "@ai-sdk/openai"

const openai = createOpenAI()

export const aiModel = openai("gpt-5.6-luna")