import { createPublicKey, verify } from "node:crypto"
import { encrypt, hashState } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

type Claims = { iss: string; aud: string | string[]; sub: string; nonce: string; exp: number; email?: string }

async function verifyIdentity(token: string, clientId: string, nonce: string): Promise<Claims> {
  const [header, payload, signature] = token.split(".")
  if (!header || !payload || !signature) throw new Error("Invalid ID token")
  const metadata = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg: string; kid: string }
  if (metadata.alg !== "RS256") throw new Error("Unexpected ID token algorithm")
  const response = await fetch("https://auth.openai.com/.well-known/jwks.json", { cache: "no-store" })
  if (!response.ok) throw new Error("Could not verify identity")
  const { keys } = await response.json() as { keys: Array<JsonWebKey & { kid?: string }> }
  const key = keys.find((item) => item.kid === metadata.kid)
  if (!key || !verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), createPublicKey({ key: key as unknown as import("node:crypto").JsonWebKey, format: "jwk" }), Buffer.from(signature, "base64url"))) throw new Error("Invalid ID token signature")
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims
  if (claims.iss !== "https://auth.openai.com" || !(Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId) || claims.nonce !== nonce || claims.exp * 1000 <= Date.now() || !claims.sub) throw new Error("Invalid ID token claims")
  return claims
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get("state")
  if (!state) return new Response("Missing state", { status: 400 })
  const stateHash = hashState(state)
  const attempt = await prisma.chatGptAuthAttempt.findUnique({ where: { stateHash } })
  // Next.js may normalize request.url to BETTER_AUTH_URL (localhost) even when
  // the browser reaches the loopback callback at 127.0.0.1. The saved URI is
  // the exact URI sent to OpenAI and used again in the code exchange.
  if (!attempt || new URL(attempt.redirectUri).pathname !== url.pathname || attempt.expiresAt <= new Date()) return new Response("Expired sign-in attempt", { status: 400 })
  const consumed = await prisma.chatGptAuthAttempt.deleteMany({ where: { stateHash, expiresAt: { gt: new Date() } } })
  if (consumed.count !== 1) return new Response("Sign-in attempt already used", { status: 400 })
  const destination = new URL("/settings/ai", attempt.returnOrigin)
  if (url.searchParams.has("error")) {
    destination.searchParams.set("error", "authorization_declined")
    return Response.redirect(destination)
  }
  const code = url.searchParams.get("code")
  const returnedClientId = url.searchParams.get("client_id")
  const clientId = attempt.clientId === "dynamic_agent_client" ? returnedClientId : attempt.clientId
  if (!code || !clientId || clientId === "dynamic_agent_client" || (returnedClientId && returnedClientId !== clientId)) {
    destination.searchParams.set("error", "registration_incomplete")
    return Response.redirect(destination)
  }
  try {
    const response = await fetch("https://auth.openai.com/api/accounts/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: "https://api.openai.com/v1" }),
      cache: "no-store",
    })
    if (!response.ok) throw new Error("Token exchange failed")
    const tokens = await response.json() as { id_token: string; access_token: string; refresh_token: string; expires_in: number; scope: string }
    if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes("chatgpt.tokens.use.direct")) throw new Error("Plan usage was not authorized")
    const claims = await verifyIdentity(tokens.id_token, clientId, attempt.nonce)
    const existing = await prisma.userSettings.findUnique({ where: { userId: attempt.userId } })
    if (existing?.chatgptSubject && existing.chatgptSubject !== claims.sub) throw new Error("Different ChatGPT account")
    await prisma.userSettings.upsert({
      where: { userId: attempt.userId },
      create: { userId: attempt.userId, aiConnection: "chatgpt", chatgptSubject: claims.sub, chatgptEmail: claims.email, chatgptClientId: clientId, encryptedIdToken: encrypt(tokens.id_token), encryptedAccessToken: encrypt(tokens.access_token), encryptedRefreshToken: encrypt(tokens.refresh_token), accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), chatgptScopes: tokens.scope },
      update: { aiConnection: "chatgpt", chatgptSubject: claims.sub, chatgptEmail: claims.email, chatgptClientId: clientId, encryptedIdToken: encrypt(tokens.id_token), encryptedAccessToken: encrypt(tokens.access_token), encryptedRefreshToken: encrypt(tokens.refresh_token), accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), chatgptScopes: tokens.scope },
    })
    destination.searchParams.set("connected", "chatgpt")
  } catch {
    destination.searchParams.set("error", "connection_failed")
  }
  return Response.redirect(destination)
}
