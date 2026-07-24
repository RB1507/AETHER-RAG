import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

export async function GET(request: Request) {
  const uid = getUserIdFromRequest(request)
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId')

  if (workspaceId) {
    // Conversations are scoped through workspace ownership: another account's
    // workspace id yields an empty list, not their chats.
    if (!mockDb.userOwnsWorkspace(workspaceId, uid)) {
      return NextResponse.json([])
    }
    return NextResponse.json(mockDb.conversations.filter((c) => c.workspaceId === workspaceId))
  }

  if (!uid) return NextResponse.json([])
  const ownedIds = new Set(mockDb.workspacesFor(uid).map((w) => w.id))
  return NextResponse.json(
    mockDb.conversations.filter((c) => c.workspaceId && ownedIds.has(c.workspaceId))
  )
}

export async function POST(request: Request) {
  try {
    const uid = getUserIdFromRequest(request)
    const { title, workspaceId } = await request.json()
    if (!title) {
      return NextResponse.json({ message: 'Title is required' }, { status: 400 })
    }
    if (!mockDb.userOwnsWorkspace(workspaceId || null, uid)) {
      return NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
    }
    const conv = mockDb.addConversation(title, workspaceId)
    return NextResponse.json(conv, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
