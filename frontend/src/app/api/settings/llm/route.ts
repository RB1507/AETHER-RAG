import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Proxy the LLM provider/model selection to/from the backend. GET returns the
 * current selection + available providers/models; POST switches it (effective
 * immediately, no restart).
 */
async function proxy(request: Request, method: 'GET' | 'POST', body?: string) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '')
  try {
    const res = await fetch(`${BACKEND_URL}/api/settings/llm`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { message: 'Could not reach the backend to read/change the model.' },
      { status: 503 }
    )
  }
}

export async function GET(request: Request) {
  return proxy(request, 'GET')
}

export async function POST(request: Request) {
  return proxy(request, 'POST', await request.text())
}
