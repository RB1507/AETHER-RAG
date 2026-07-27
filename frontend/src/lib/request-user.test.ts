import { describe, it, expect } from 'vitest'
import { getUserIdFromRequest } from './request-user'

// Build a JWT-shaped token (header.payload.signature); only the payload is read.
function token(payload: object) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${b64}.sig`
}

const req = (auth?: string) =>
  new Request('http://localhost/api/x', { headers: auth ? { Authorization: auth } : {} })

describe('getUserIdFromRequest', () => {
  it('returns the sub claim from a Bearer token', () => {
    expect(getUserIdFromRequest(req(`Bearer ${token({ sub: 'user@x.com' })}`))).toBe('user@x.com')
  })
  it('returns null when there is no Authorization header', () => {
    expect(getUserIdFromRequest(req())).toBeNull()
  })
  it('returns null for a non-Bearer scheme', () => {
    expect(getUserIdFromRequest(req(token({ sub: 'user@x.com' })))).toBeNull()
  })
  it('returns null for a malformed (non-3-part) token', () => {
    expect(getUserIdFromRequest(req('Bearer not.a.valid.jwt.here'))).toBeNull()
    expect(getUserIdFromRequest(req('Bearer justonepart'))).toBeNull()
  })
  it('returns null when the payload has no sub', () => {
    expect(getUserIdFromRequest(req(`Bearer ${token({ foo: 'bar' })}`))).toBeNull()
  })
  it('returns null when the payload is not valid base64/JSON', () => {
    expect(getUserIdFromRequest(req('Bearer a.@@@notbase64@@@.c'))).toBeNull()
  })
})
