import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Proxy to the backend's real document-processing status so the client can poll
 * actual progress (processing → completed/failed) instead of faking it with
 * timers. `id` here is the backend document id (doc_xxxx).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  try {
    const backendResponse = await fetch(`${BACKEND_URL}/api/documents/${id}/status`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store',
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}))
      return NextResponse.json(
        { message: errorData.detail || 'Failed to fetch document status' },
        { status: backendResponse.status }
      )
    }

    return NextResponse.json(await backendResponse.json())
  } catch (backendError) {
    console.error('Backend not available for status check:', backendError)
    return NextResponse.json(
      { message: 'Could not reach the backend to check document status.' },
      { status: 503 }
    )
  }
}
