import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/** Delete a saved custom LLM provider. Proxies to the authenticated backend
 *  endpoint, forwarding the bearer token. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ cid: string }> }
) {
  const { cid } = await params
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '')
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/settings/llm/custom/${encodeURIComponent(cid)}`,
      {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        cache: 'no-store',
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { message: data.detail || 'Failed to delete provider' },
        { status: res.status }
      )
    }
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { message: 'Could not reach the backend to delete the provider.' },
      { status: 503 }
    )
  }
}
