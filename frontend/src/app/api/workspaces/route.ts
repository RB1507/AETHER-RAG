import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

export async function GET(request: Request) {
  const uid = getUserIdFromRequest(request)
  if (!uid) {
    // No identity — show nothing rather than everyone's data.
    return NextResponse.json([])
  }
  return NextResponse.json(mockDb.workspacesFor(uid))
}

export async function POST(request: Request) {
  try {
    const uid = getUserIdFromRequest(request)
    if (!uid) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 })
    }
    const { name, description } = await request.json()
    if (!name) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 })
    }
    const ws = mockDb.addWorkspace(name, description, uid)
    return NextResponse.json(ws, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
