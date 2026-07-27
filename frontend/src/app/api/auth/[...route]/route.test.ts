import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST, GET } from './route'

// Fake a backend fetch Response with the given status + JSON body.
function fakeRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

const post = (path: string, body: unknown) =>
  POST(new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/auth/login', () => {
  it('maps a backend token to { user, accessToken, refreshToken }', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      fakeRes(200, { access_token: 'AT', refresh_token: 'RT' })
    )
    const res = await post('/api/auth/login', { email: 'a@b.com', password: 'pw' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.accessToken).toBe('AT')
    expect(data.refreshToken).toBe('RT')
    expect(data.user.email).toBe('a@b.com')
  })

  it('passes through a 401 with a message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(401, { detail: 'Incorrect email or password' }))
    const res = await post('/api/auth/login', { email: 'a@b.com', password: 'bad' })
    expect(res.status).toBe(401)
    expect((await res.json()).message).toBe('Incorrect email or password')
  })

  it('returns 503 when the backend is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const res = await post('/api/auth/login', { email: 'a@b.com', password: 'pw' })
    expect(res.status).toBe(503)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('requires email, securityAnswer and password (400, no fetch)', async () => {
    const res = await post('/api/auth/reset-password', { email: 'a@b.com', password: 'pw' })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards {email, security_answer, new_password} and succeeds', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { email: 'a@b.com' }))
    const res = await post('/api/auth/reset-password', {
      email: 'a@b.com',
      securityAnswer: 'Rex',
      password: 'newpw1',
    })
    expect(res.status).toBe(200)
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(sentBody).toEqual({ email: 'a@b.com', security_answer: 'Rex', new_password: 'newpw1' })
  })

  it('surfaces the backend 401 (wrong answer)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(401, { detail: 'Incorrect answer to the security question' }))
    const res = await post('/api/auth/reset-password', {
      email: 'a@b.com',
      securityAnswer: 'wrong',
      password: 'newpw1',
    })
    expect(res.status).toBe(401)
    expect((await res.json()).message).toMatch(/Incorrect answer/)
  })
})

describe('GET /api/auth/security-question', () => {
  const get = (qs: string) => GET(new Request(`http://localhost/api/auth/security-question${qs}`))

  it('requires an email (400)', async () => {
    const res = await get('')
    expect(res.status).toBe(400)
  })

  it('returns { securityQuestion } from the backend', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { security_question: 'First pet?' }))
    const res = await get('?email=a@b.com')
    expect(res.status).toBe(200)
    expect((await res.json()).securityQuestion).toBe('First pet?')
  })

  it('passes through a 404 for an unknown email', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(404, { detail: 'No account found with that email' }))
    const res = await get('?email=nobody@b.com')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/auth/signup', () => {
  const body = {
    name: 'A',
    email: 'a@b.com',
    password: 'pw',
    securityQuestion: 'First pet?',
    securityAnswer: 'Rex',
  }

  it('registers (forwarding security fields) then auto-logs-in', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fakeRes(201, { email: 'a@b.com' })) // register
      .mockResolvedValueOnce(fakeRes(200, { access_token: 'AT', refresh_token: 'RT' })) // login
    const res = await post('/api/auth/signup', body)
    expect(res.status).toBe(200)
    expect((await res.json()).accessToken).toBe('AT')
    const registerBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(registerBody.security_question).toBe('First pet?')
    expect(registerBody.security_answer).toBe('Rex')
  })

  it('requires a security question + answer (400, no fetch)', async () => {
    const res = await post('/api/auth/signup', { name: 'A', email: 'a@b.com', password: 'pw' })
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('passes through a register failure (duplicate email)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(400, { detail: 'Email already registered' }))
    const res = await post('/api/auth/signup', body)
    expect(res.status).toBe(400)
    expect((await res.json()).message).toMatch(/already registered/)
  })
})

describe('POST /api/auth/refresh', () => {
  it('returns a fresh accessToken', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(200, { access_token: 'NEW' }))
    const res = await post('/api/auth/refresh', { refreshToken: 'RT' })
    expect(res.status).toBe(200)
    expect((await res.json()).accessToken).toBe('NEW')
  })
  it('401 when no token is provided (no fetch)', async () => {
    const res = await post('/api/auth/refresh', {})
    expect(res.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('401 when the backend rejects the refresh token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fakeRes(401, {}))
    const res = await post('/api/auth/refresh', { refreshToken: 'bad' })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns success without hitting the backend', async () => {
    const res = await post('/api/auth/logout', {})
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})
