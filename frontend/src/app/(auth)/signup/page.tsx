'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signupSchema, SignupInput } from '@/lib/schemas/auth'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, Lock, Mail, User, Loader2 } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { slideUp } from '@/lib/animations'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { ROUTES } from '@/constants/routes'

export default function SignupPage() {
  const { signup, isSigningUp } = useAuth()
  const [showPassword, setShowPassword] = React.useState(false)
  const [apiError, setApiError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const onSubmit = async (data: SignupInput) => {
    setApiError(null)
    try {
      await signup({
        name: data.name,
        email: data.email,
        password: data.password,
      })
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong during signup.')
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-background overflow-hidden px-4 py-8">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />

      {/* Theme toggle */}
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <motion.div
        variants={slideUp}
        initial="initial"
        animate="animate"
        className="w-full max-w-md z-10"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary text-white shadow-md shadow-brand-primary/20 mb-3">
            <BrandMark className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">AETHER RAG</h1>
          <p className="text-sm text-text-muted mt-1">Enterprise-grade AI Knowledge Base</p>
        </div>

        <Card className="border border-border/80 bg-surface-primary/80 dark:bg-card/70 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-bold tracking-tight">Create an account</CardTitle>
            <CardDescription className="text-xs">
              Sign up today and start querying your custom datasets.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {apiError && (
                <div className="rounded-lg bg-danger/10 border border-danger/25 p-3 text-xs text-danger font-medium leading-relaxed">
                  {apiError}
                </div>
              )}

              {/* Name Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="name"
                  className="text-xs font-semibold text-text-secondary"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    disabled={isSigningUp}
                    className="pl-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                    {...register('name')}
                  />
                </div>
                {errors.name && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>

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
                    disabled={isSigningUp}
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
                <label
                  htmlFor="password"
                  className="text-xs font-semibold text-text-secondary"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    disabled={isSigningUp}
                    className="pl-10 pr-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSigningUp}
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

              {/* Confirm Password Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-xs font-semibold text-text-secondary"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    disabled={isSigningUp}
                    className="pl-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                    {...register('confirmPassword')}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSigningUp}
                className="w-full h-10 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-sm transition-all focus-visible:ring-brand-primary mt-2"
              >
                {isSigningUp ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  'Sign Up'
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="bg-surface-secondary/40 border-t border-border/50 py-4 flex justify-center">
            <p className="text-xs text-text-muted">
              Already have an account?{' '}
              <Link
                href={ROUTES.AUTH.LOGIN}
                className="font-semibold text-brand-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  )
}
