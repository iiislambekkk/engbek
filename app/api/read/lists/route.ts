import { randomUUID } from "node:crypto"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAllowedAppOrigin } from "@/lib/request-origin"

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const lists = await prisma.readBookList.findMany({ where: { userId: session.user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { books: true } } } })
  return Response.json({ lists })
}

export async function POST(request: Request) {
  if (!isAllowedAppOrigin(request)) return Response.json({ error: "Forbidden." }, { status: 403 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const body = await request.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 80) return Response.json({ error: "List names must be between 1 and 80 characters." }, { status: 400 })
  try {
    const list = await prisma.readBookList.create({ data: { id: randomUUID(), userId: session.user.id, name }, select: { id: true, name: true, _count: { select: { books: true } } } })
    return Response.json({ list }, { status: 201 })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return Response.json({ error: "A list with this name already exists." }, { status: 409 })
    throw error
  }
}
