import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from './route'

function fakeRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const post = (body: unknown, token?: string) =>
  POST(
    new Request('http://localhost/api/settings/llm/custom', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    })
  )

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('POST /api/settings/llm/custom', () => {
  it('forwards the bearer token and body, returns success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { provider: 'custom', model: 'gpt-4o-mini' }))
    const res = await post(
      { base_url: 'https://api.openai.com/v1', api_key: 'sk-x', model: 'gpt-4o-mini' },
      'TOK'
    )
    expect(res.status).toBe(200)
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer TOK')
    expect((await res.json()).provider).toBe('custom')
  })

  it('maps a backend error detail to { message }', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(401, { detail: 'Incorrect password' }))
    const res = await post({ base_url: 'x', api_key: 'y', model: 'z' }, 'TOK')
    expect(res.status).toBe(401)
    expect((await res.json()).message).toBe('Incorrect password')
  })

  it('returns 503 when the backend is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('down'))
    const res = await post({ base_url: 'x', api_key: 'y', model: 'z' }, 'TOK')
    expect(res.status).toBe(503)
  })
})
