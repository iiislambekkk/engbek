import "server-only"

/** Apply the request restrictions needed for ChatGPT plan usage. */
export const chatgptFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.endsWith("/responses") || !init?.body || typeof init.body !== "string") return fetch(input, init)

  const body = JSON.parse(init.body) as Record<string, unknown>
  body.store = false
  body.stream = true
  for (const field of ["background", "conversation", "max_output_tokens", "max_tool_calls", "metadata", "moderation", "multi_agent", "prompt", "prompt_cache_retention", "safety_identifier", "temperature", "top_logprobs", "top_p", "truncation", "user", "previous_response_id"]) delete body[field]
  return fetch(input, { ...init, body: JSON.stringify(body) })
}
