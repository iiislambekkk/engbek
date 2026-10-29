const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.8.63:3000",
  "http://10.86.28.84:3000",
  ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).origin] : []),
  ...(process.env.CHROME_EXTENSION_ORIGIN ? [process.env.CHROME_EXTENSION_ORIGIN] : []),
])

export function isAllowedAppOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false

  // WHATWG URL reports "null" for extension schemes, so compare the canonical
  // Chrome extension origin directly after validating its exact shape.
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return allowedOrigins.has(origin)

  try {
    const parsed = new URL(origin)
    return parsed.origin === origin && allowedOrigins.has(origin)
  } catch {
    return false
  }
}
