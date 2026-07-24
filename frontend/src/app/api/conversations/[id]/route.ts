import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!mockDb.userOwnsConversation(id, getUserIdFromRequest(request))) {
    return NextResponse.json({ message: 'Conversation not found' }, { status: 404 })
  }
  const success = mockDb.deleteConversation(id)
  if (success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ message: 'Conversation not found' }, { status: 404 })
}

// Rename a conversation.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!mockDb.userOwnsConversation(id, getUserIdFromRequest(request))) {
    return NextResponse.json({ message: 'Conversation not found' }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return NextResponse.json({ message: 'Title is required' }, { status: 400 })
  }
  const success = mockDb.renameConversation(id, title)
  if (success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ message: 'Conversation not found' }, { status: 404 })
}
