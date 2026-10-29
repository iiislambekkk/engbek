import { auth } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: "Sign in to Lexi first." }, { status: 401 })
  return Response.json({ user: { id: session.user.id, name: session.user.name, email: session.user.email } }, { headers: { "Cache-Control": "no-store" } })
}
