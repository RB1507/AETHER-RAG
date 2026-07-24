'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, LoginInput } from '@/lib/schemas/auth'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { slideUp } from '@/lib/animations'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { ROUTES } from '@/constants/routes'

const REMEMBER_KEY = 'aether_remember'
const SAVED_EMAIL_KEY = 'aether_saved_email'

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth()
  const [showPassword, setShowPassword] = React.useState(false)
  const [apiError, setApiError] = React.useState<string | null>(null)
  const [remember, setRemember] = React.useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  // Autofill only the saved email on load (never the password) if "Remember
  // me" was used previously. Passwords are never stored.
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(REMEMBER_KEY) === '1') {
      const email = localStorage.getItem(SAVED_EMAIL_KEY) || ''
      if (email) setValue('email', email)
      setRemember(true)
    }
  }, [setValue])

  const onSubmit = async (data: LoginInput) => {
    setApiError(null)
    try {
      await login(data)
      // Persist (or clear) the autofill credentials based on the checkbox.
      if (typeof window !== 'undefined') {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, '1')
          localStorage.setItem(SAVED_EMAIL_KEY, data.email)
        } else {
          localStorage.removeItem(REMEMBER_KEY)
          localStorage.removeItem(SAVED_EMAIL_KEY)
        }
        // Clean up any password persisted by older builds.
        localStorage.removeItem('aether_saved_password')
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Invalid email or password.')
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-background overflow-hidden px-4">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <motion.div
        variants={slideUp}
        initial="initial"
        animate="animate"
        className="w-full max-w-md z-10"
      >
        {/* Logo/Brand Title */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary text-white shadow-md shadow-brand-primary/20 mb-3">
            <BrandMark className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">AETHER RAG</h1>
          <p className="text-sm text-text-muted mt-1">Enterprise-grade AI Knowledge Base</p>
        </div>

        <Card className="border border-border/80 bg-surface-primary/80 dark:bg-card/70 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-bold tracking-tight">Sign in</CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials to access your chat workspace.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {apiError && (
                <div className="rounded-lg bg-danger/10 border border-danger/25 p-3 text-xs text-danger font-medium leading-relaxed">
                  {apiError}
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-semibold text-text-secondary"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    disabled={isLoggingIn}
                    className="pl-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-xs font-semibold text-text-secondary"
                  >
                    Password
                  </label>
                  <Link
                    href={ROUTES.AUTH.FORGOT_PASSWORD}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    disabled={isLoggingIn}
                    className="pl-10 pr-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoggingIn}
                    className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember me / autofill */}
              <label className="flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={isLoggingIn}
                  className="h-3.5 w-3.5 rounded border-border accent-brand-primary cursor-pointer"
                />
                Remember me on this device
              </label>

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-10 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-sm transition-all focus-visible:ring-brand-primary mt-2"
              >
                {isLoggingIn ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="bg-surface-secondary/40 border-t border-border/50 py-4 flex justify-center">
            <p className="text-xs text-text-muted">
              Don&apos;t have an account?{' '}
              <Link
                href={ROUTES.AUTH.SIGNUP}
                className="font-semibold text-brand-primary hover:underline"
              >
                Create an account
              </Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  )
}
