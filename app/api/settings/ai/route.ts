import { auth } from "@/lib/auth"
import { decrypt } from "@/lib/ai/credentials"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export const runtime = "nodejs"

async function userId(request: Request) {
  return (await auth.api.getSession({ headers: request.headers }))?.user.id
}

export async function GET(request: Request) {
  const id = await userId(request)
  if (!id) return new Response("Unauthorized", { status: 401 })
  const settings = await prisma.userSettings.findUnique({ where: { userId: id } })
  if (settings?.encryptedApiKey || settings?.aiConnection === "api_key") {
    await prisma.userSettings.update({
      where: { userId: id },
      data: {
        encryptedApiKey: null,
        ...(settings.aiConnection === "api_key" ? { aiConnection: "none" } : {}),
      },
    })
  }
  return Response.json({
    connection: settings?.aiConnection === "chatgpt" || settings?.aiConnection === "openai_api_key" ? settings.aiConnection : "none",
    openaiApiKeyAvailable: !!process.env.OPENAI_API_KEY,
    chatgptEmail: settings?.chatgptEmail ?? null,
    chatgptEnabled: !!settings?.chatgptScopes?.split(" ").includes("chatgpt.tokens.use.direct"),
    chatgptAvailable: new URL(request.url).protocol === "http:" && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname),
    watchHighlightColor: settings?.watchHighlightColor ?? "#a78bfa",
  })
}

export async function PATCH(request: Request) {
  if (!isAllowedAppOrigin(request)) return new Response("Forbidden", { status: 403 })
  const id = await userId(request)
  if (!id) return new Response("Unauthorized", { status: 401 })
  const body = await request.json().catch(() => null) as { connection?: unknown; watchHighlightColor?: unknown } | null
  if (!body ||
    (body.connection !== undefined && !["openai_api_key", "chatgpt"].includes(String(body.connection))) ||
    (body.watchHighlightColor !== undefined && (typeof body.watchHighlightColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.watchHighlightColor)))) {
    return Response.json({ error: "Invalid settings." }, { status: 400 })
  }
  const settings = await prisma.userSettings.findUnique({ where: { userId: id } })
  const savedConnection = settings?.aiConnection === "chatgpt" || settings?.aiConnection === "openai_api_key" ? settings.aiConnection : "none"
  const connection = body.connection ?? savedConnection
  if (connection === "openai_api_key" && !process.env.OPENAI_API_KEY) return Response.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 400 })
  if (connection === "chatgpt" && (!settings?.encryptedRefreshToken || !settings.chatgptScopes?.split(" ").includes("chatgpt.tokens.use.direct"))) return Response.json({ error: "Connect ChatGPT with plan usage first." }, { status: 400 })
  await prisma.userSettings.upsert({
    where: { userId: id },
    create: { userId: id, aiConnection: String(connection), watchHighlightColor: (body.watchHighlightColor as string | undefined) ?? "#a78bfa" },
    update: { aiConnection: String(connection), encryptedApiKey: null, watchHighlightColor: body.watchHighlightColor as string | undefined },
  })
  return GET(request)
}

export async function DELETE(request: Request) {
  if (!isAllowedAppOrigin(request)) return new Response("Forbidden", { status: 403 })
  const id = await userId(request)
  if (!id) return new Response("Unauthorized", { status: 401 })
  const type = new URL(request.url).searchParams.get("type")
  const settings = await prisma.userSettings.findUnique({ where: { userId: id } })
  if (type === "chatgpt") {
    if (settings?.encryptedRefreshToken && settings.chatgptClientId) {
      try {
        const discovery = await fetch("https://auth.openai.com/.well-known/openid-configuration", { cache: "no-store" })
        const { revocation_endpoint: endpoint } = await discovery.json() as { revocation_endpoint: string }
        if (endpoint && new URL(endpoint).origin === "https://auth.openai.com") {
          await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(settings.encryptedRefreshToken), token_type_hint: "refresh_token", client_id: settings.chatgptClientId }), cache: "no-store" })
        }
      } catch { /* Local disconnect still removes the credential. */ }
    }
    await prisma.userSettings.updateMany({ where: { userId: id }, data: { encryptedAccessToken: null, encryptedRefreshToken: null, encryptedIdToken: null, chatgptClientId: null, chatgptSubject: null, chatgptEmail: null, chatgptScopes: null, accessTokenExpiresAt: null, aiConnection: settings?.aiConnection === "chatgpt" ? "none" : settings?.aiConnection } })
  } else return Response.json({ error: "Invalid connection." }, { status: 400 })
  return GET(request)
}
