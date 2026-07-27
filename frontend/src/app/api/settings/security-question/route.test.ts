import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PUT } from './route'

function fakeRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

const put = (body: unknown, token?: string) =>
  PUT(
    new Request('http://localhost/api/settings/security-question', {
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    })
  )

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('PUT /api/settings/security-question', () => {
  it('forwards the bearer token + body and returns success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { security_question: 'First pet?' }))
    const res = await put(
      { current_password: 'pw', security_question: 'First pet?', security_answer: 'Rex' },
      'TOK'
    )
    expect(res.status).toBe(200)
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer TOK')
  })

  it('maps a wrong-password 401 detail to { message }', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(401, { detail: 'Incorrect password' }))
    const res = await put({ current_password: 'bad', security_question: 'Q', security_answer: 'a' }, 'TOK')
    expect(res.status).toBe(401)
    expect((await res.json()).message).toBe('Incorrect password')
  })

  it('returns 503 when the backend is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('down'))
    const res = await put({ current_password: 'pw', security_question: 'Q', security_answer: 'a' }, 'TOK')
    expect(res.status).toBe(503)
  })
})
