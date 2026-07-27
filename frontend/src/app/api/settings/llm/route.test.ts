import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET, POST } from './route'

function fakeRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const withToken = (method: string, body?: unknown) =>
  new Request('http://localhost/api/settings/llm', {
    method,
    headers: { Authorization: 'Bearer TOK' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/settings/llm', () => {
  it('returns the backend selection and forwards the token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { provider: 'custom', model: 'gpt-4o-mini', providers: [] }))
    const res = await GET(withToken('GET'))
    expect(res.status).toBe(200)
    expect((await res.json()).provider).toBe('custom')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer TOK')
  })

  it('returns 503 when the backend is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('down'))
    const res = await GET(withToken('GET'))
    expect(res.status).toBe(503)
  })
})

describe('POST /api/settings/llm', () => {
  it('forwards the selection body and passes the status through', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { provider: 'ollama', model: 'qwen' }))
    const res = await POST(withToken('POST', { provider: 'ollama', model: 'qwen' }))
    expect(res.status).toBe(200)
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(sent).toEqual({ provider: 'ollama', model: 'qwen' })
  })

  it('passes a backend 400 through', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(400, { detail: 'No API key configured' }))
    const res = await POST(withToken('POST', { provider: 'openrouter', model: 'x' }))
    expect(res.status).toBe(400)
  })
})
