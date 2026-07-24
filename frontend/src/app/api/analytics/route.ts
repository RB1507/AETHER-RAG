import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

export async function GET() {
  return NextResponse.json(mockDb.analytics)
}
