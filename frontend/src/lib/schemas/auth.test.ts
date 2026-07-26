import { describe, it, expect } from 'vitest'
import { loginSchema, signupSchema, forgotPasswordSchema } from './auth'

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'secret' }).success).toBe(true)
  })
  it('rejects an invalid email', () => {
    const r = loginSchema.safeParse({ email: 'not-an-email', password: 'secret' })
    expect(r.success).toBe(false)
  })
  it('rejects a password shorter than 6', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '123' })
    expect(r.success).toBe(false)
  })
})

describe('signupSchema', () => {
  const base = {
    name: 'Jane',
    email: 'jane@example.com',
    password: 'secret1',
    confirmPassword: 'secret1',
    securityQuestion: 'What was the name of your first pet?',
    securityAnswer: 'Rex',
  }

  it('accepts a complete valid signup', () => {
    expect(signupSchema.safeParse(base).success).toBe(true)
  })
  it('rejects mismatched passwords on the confirmPassword field', () => {
    const r = signupSchema.safeParse({ ...base, confirmPassword: 'different' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('confirmPassword'))).toBe(true)
    }
  })
  it('requires a security question', () => {
    expect(signupSchema.safeParse({ ...base, securityQuestion: '' }).success).toBe(false)
  })
  it('rejects a security answer shorter than 2 chars', () => {
    expect(signupSchema.safeParse({ ...base, securityAnswer: 'x' }).success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  const base = {
    email: 'jane@example.com',
    securityAnswer: 'Rex',
    password: 'newpass1',
    confirmPassword: 'newpass1',
  }

  it('accepts a valid reset payload', () => {
    expect(forgotPasswordSchema.safeParse(base).success).toBe(true)
  })
  it('requires a security answer', () => {
    expect(forgotPasswordSchema.safeParse({ ...base, securityAnswer: '' }).success).toBe(false)
  })
  it('rejects mismatched new passwords', () => {
    const r = forgotPasswordSchema.safeParse({ ...base, confirmPassword: 'nope' })
    expect(r.success).toBe(false)
  })
})
