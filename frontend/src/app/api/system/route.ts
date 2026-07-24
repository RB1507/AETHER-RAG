import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Exposes the backend's active LLM config (provider + model) to the client so the
 * chat UI can show the model that actually answers, instead of a hardcoded guess.
 * The backend is the single source of truth — the model is configured server-side
 * via .env / settings.env and the selected value is not chosen from the client.
 */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ provider: null, model: null }, { status: 200 })
    }
    const data = await res.json()
    return NextResponse.json({
      provider: data.provider ?? null,
      model: data.model ?? null,
    })
  } catch {
    // Backend unreachable — report unknown rather than a misleading name.
    return NextResponse.json({ provider: null, model: null }, { status: 200 })
  }
}
