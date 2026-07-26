import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Save a user-supplied OpenAI-compatible LLM endpoint (base URL + API key +
 * model). Proxies to the authenticated backend endpoint with the bearer token.
 */
export async function POST(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '')
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings/llm/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await request.text(),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { message: data.detail || 'Failed to save custom model' },
        { status: res.status }
      )
    }
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { message: 'Could not reach the backend to save the custom model.' },
      { status: 503 }
    )
  }
}
