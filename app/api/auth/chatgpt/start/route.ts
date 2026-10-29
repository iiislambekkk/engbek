import { createHash, randomBytes } from "node:crypto"
import { auth } from "@/lib/auth"
import { hashState } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin || !isAllowedAppOrigin(request)) return new Response("Forbidden", { status: 403 })
  const site = new URL(origin)
  if (site.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(site.hostname)) {
    return Response.json({ error: "This ChatGPT connection is available only on a local installation." }, { status: 403 })
  }
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return new Response("Unauthorized", { status: 401 })
  const settings = await prisma.userSettings.findUnique({ where: { userId: session.user.id } })
  const clientId = settings?.encryptedIdToken && settings.chatgptClientId ? settings.chatgptClientId : "dynamic_agent_client"
  const host = await prisma.chatGptHost.upsert({ where: { id: "local" }, create: { id: "local", hostId: `urn:uuid:${crypto.randomUUID()}` }, update: {} })
  const state = randomBytes(32).toString("base64url")
  const nonce = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const redirectUri = `http://127.0.0.1:${site.port || "80"}/auth/callback`
  await prisma.chatGptAuthAttempt.create({ data: { stateHash: hashState(state), userId: session.user.id, nonce, verifier, redirectUri, returnOrigin: origin, clientId, expiresAt: new Date(Date.now() + 10 * 60_000) } })
  const url = new URL("https://auth.openai.com/api/accounts/authorize")
  url.search = new URLSearchParams({
    client_id: clientId,
    ext_agent_host_id: host.hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource: "https://api.openai.com/v1",
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString()
  if (clientId === "dynamic_agent_client") url.searchParams.set("agent_name_hint", "Engbek")
  else {
    if (settings?.encryptedIdToken) {
      const { decrypt } = await import("@/lib/ai/credentials")
      url.searchParams.set("id_token_hint", decrypt(settings.encryptedIdToken))
    }
    if (settings?.chatgptEmail) url.searchParams.set("login_hint", settings.chatgptEmail)
  }
  return Response.json({ url: url.toString() })
}
