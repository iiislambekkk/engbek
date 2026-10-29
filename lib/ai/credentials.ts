import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"

function encryptionKey() {
  const secret = process.env.AI_CREDENTIAL_ENCRYPTION_KEY
  if (secret) {
    if (!/^[a-f\d]{64}$/i.test(secret)) throw new Error("AI_CREDENTIAL_ENCRYPTION_KEY must be 64 hexadecimal characters")
    return Buffer.from(secret, "hex")
  }
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("Credential encryption is not configured")
  return createHash("sha256").update(`engbek-ai-credentials:${process.env.BETTER_AUTH_SECRET}`).digest()
}

export function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")
}

export function decrypt(value: string) {
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"))
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

export function hashState(state: string) {
  return createHash("sha256").update(state).digest("hex")
}

export async function getAiCredential(userId: string) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } })
  if (settings?.aiConnection === "openai_api_key") {
    const token = process.env.OPENAI_API_KEY
    if (!token) throw new Error("OPENAI_API_KEY is not configured on the server.")
    return { type: "api_key" as const, token }
  }
  if (settings?.aiConnection === "chatgpt" && settings.encryptedAccessToken && settings.encryptedRefreshToken && settings.chatgptClientId) {
    if (!settings.chatgptScopes?.split(" ").includes("chatgpt.tokens.use.direct")) {
      throw new Error("ChatGPT plan usage has not been authorized")
    }
    if (settings.accessTokenExpiresAt && settings.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
      return { type: "chatgpt" as const, token: decrypt(settings.encryptedAccessToken) }
    }
    const form = new URLSearchParams({ grant_type: "refresh_token", client_id: settings.chatgptClientId, refresh_token: decrypt(settings.encryptedRefreshToken), resource: "https://api.openai.com/v1" })
    const response = await fetch("https://auth.openai.com/api/accounts/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
    })
    if (!response.ok) throw new Error("ChatGPT connection expired. Reconnect in settings.")
    const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
    if (!tokens.access_token) throw new Error("ChatGPT connection expired. Reconnect in settings.")
    if (tokens.scope && !tokens.scope.split(" ").includes("chatgpt.tokens.use.direct")) throw new Error("ChatGPT plan usage is no longer authorized. Reconnect in settings.")
    await prisma.userSettings.update({
      where: { userId },
      data: {
        encryptedAccessToken: encrypt(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : settings.encryptedRefreshToken,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        chatgptScopes: tokens.scope ?? settings.chatgptScopes,
      },
    })
    return { type: "chatgpt" as const, token: tokens.access_token }
  }
  throw new Error("Choose an AI connection in settings.")
}
