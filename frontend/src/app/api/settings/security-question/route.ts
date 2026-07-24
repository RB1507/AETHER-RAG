import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Set or change the logged-in user's security question. Proxies to the
 * authenticated backend endpoint, forwarding the bearer token. The backend
 * requires the current password, so this is safe to expose from Settings.
 */
export async function PUT(request: Request) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '')
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/security-question`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await request.text(),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Normalize FastAPI's { detail } to { message } for the api-client.
      return NextResponse.json(
        { message: data.detail || 'Failed to update security question' },
        { status: res.status }
      )
    }
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { message: 'Could not reach the backend to update the security question.' },
      { status: 503 }
    )
  }
}
