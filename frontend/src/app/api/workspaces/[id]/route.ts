import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!mockDb.userOwnsWorkspace(id, getUserIdFromRequest(request))) {
    return NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
  }
  const success = mockDb.deleteWorkspace(id)
  if (success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
}
