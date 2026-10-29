import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 80) return Response.json({ error: "List names must be between 1 and 80 characters." }, { status: 400 })
  try {
    const result = await prisma.readBookList.updateMany({ where: { id, userId: session.user.id }, data: { name } })
    if (!result.count) return Response.json({ error: "List not found." }, { status: 404 })
    return Response.json({ list: { id, name } })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return Response.json({ error: "A list with this name already exists." }, { status: 409 })
    throw error
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const result = await prisma.readBookList.deleteMany({ where: { id, userId: session.user.id } })
  if (!result.count) return Response.json({ error: "List not found." }, { status: 404 })
  return Response.json({ ok: true })
}
