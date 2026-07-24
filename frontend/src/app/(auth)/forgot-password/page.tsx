'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordSchema, ForgotPasswordInput } from '@/lib/schemas/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Lock, ShieldQuestion, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { slideUp } from '@/lib/animations'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { ROUTES } from '@/constants/routes'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function ForgotPasswordPage() {
  const [step, setStep] = React.useState<'email' | 'challenge'>('email')
  const [question, setQuestion] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [apiError, setApiError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
      securityAnswer: '',
      password: '',
      confirmPassword: '',
    },
  })

  // Step 1 — look up the account's security question by email.
  const handleLookup = async () => {
    setApiError(null)
    const email = getValues('email')
    if (!email || !EMAIL_RE.test(email)) {
      setApiError('Please enter a valid email address.')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/auth/security-question?email=${encodeURIComponent(email)}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setApiError(body.message || 'No account found with that email.')
        return
      }
      if (!body.securityQuestion) {
        setApiError('This account has no security question set, so it can’t be reset here.')
        return
      }
      setQuestion(body.securityQuestion)
      setStep('challenge')
    } catch {
      setApiError('Could not reach the server. Ensure the app backend is running.')
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2 — verify the answer and set the new password.
  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true)
    setApiError(null)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          securityAnswer: data.securityAnswer,
          password: data.password,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setApiError(body.message || 'Password reset failed. Please try again.')
        return
      }
      setIsSuccess(true)
    } catch {
      setApiError('Could not reach the server. Ensure the app backend is running.')
    } finally {
      setIsLoading(false)
    }
  }

  // Enter in step 1 looks up the question; in step 2 it submits the reset.
  const onFormSubmit = (e: React.FormEvent) => {
    if (step === 'email') {
      e.preventDefault()
      handleLookup()
    } else {
      handleSubmit(onSubmit)(e)
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
          {!isSuccess ? (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">Reset password</CardTitle>
                <CardDescription className="text-xs">
                  {step === 'email'
                    ? 'Enter your account email to continue.'
                    : 'Answer your security question and choose a new password.'}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={onFormSubmit} className="space-y-4">
                  {/* Email Input */}
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-xs font-semibold text-text-secondary">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        disabled={isLoading || step === 'challenge'}
                        className="pl-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-xs font-medium text-danger mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  {step === 'challenge' && (
                    <>
                      {/* Security question (read-only challenge) */}
                      <div className="space-y-1.5">
                        <label htmlFor="securityAnswer" className="text-xs font-semibold text-text-secondary">
                          Security Question
                        </label>
                        <div className="rounded-md border border-border/70 bg-surface-secondary/40 px-3 py-2 text-xs text-text-secondary flex items-start gap-2">
                          <ShieldQuestion className="h-4 w-4 mt-0.5 shrink-0 text-brand-primary" />
                          <span>{question}</span>
                        </div>
                        <Input
                          id="securityAnswer"
                          type="text"
                          placeholder="Your answer"
                          disabled={isLoading}
                          className="h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                          {...register('securityAnswer')}
                        />
                        {errors.securityAnswer && (
                          <p className="text-xs font-medium text-danger mt-1">
                            {errors.securityAnswer.message}
                          </p>
                        )}
                      </div>

                      {/* New Password */}
                      <div className="space-y-1.5">
                        <label htmlFor="password" className="text-xs font-semibold text-text-secondary">
                          New Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                          <Input
                            id="password"
                            type="password"
                            placeholder="At least 6 characters"
                            disabled={isLoading}
                            className="pl-10 h-10 bg-transparent border-border focus-visible:ring-brand-primary"
                            {...register('password')}
                          />
                        </div>
                        {errors.password && (
                          <p className="text-xs font-medium text-danger mt-1">
                            {errors.password.message}
                          </p>
                        )}
                      </div>

                      {/* Confirm New Password */}
                      <div className="space-y-1.5">
                        <label htmlFor="confirmPassword" className="text-xs font-semibold text-text-secondary">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
                          <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Re-enter your new password"
                            disabled={isLoading}
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
                    </>
                  )}

                  {apiError && (
                    <p className="text-xs font-medium text-danger text-center">{apiError}</p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-sm transition-all focus-visible:ring-brand-primary mt-2"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {step === 'email' ? 'Checking...' : 'Updating password...'}
                      </span>
                    ) : step === 'email' ? (
                      'Continue'
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </form>
              </CardContent>

              <CardFooter className="bg-surface-secondary/40 border-t border-border/50 py-4 flex justify-center">
                <Link
                  href={ROUTES.AUTH.LOGIN}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-brand-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardContent className="pt-8 text-center flex flex-col items-center">
                <div className="h-12 w-12 text-success bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Password updated</h3>
                <p className="text-xs text-text-muted max-w-sm mb-6 leading-relaxed">
                  Your password has been changed. You can now sign in with your new password.
                </p>
              </CardContent>

              <CardFooter className="bg-surface-secondary/40 border-t border-border/50 py-4 flex justify-center">
                <Link
                  href={ROUTES.AUTH.LOGIN}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-brand-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </CardFooter>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
