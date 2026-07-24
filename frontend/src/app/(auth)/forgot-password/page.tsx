'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordSchema, ForgotPasswordInput } from '@/lib/schemas/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { slideUp } from '@/lib/animations'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { ROUTES } from '@/constants/routes'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSuccess, setIsSuccess] = React.useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true)
    // Simulate API request delay
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsLoading(false)
    setIsSuccess(true)
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-background overflow-hidden px-4">
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
                  Enter your email address and we will send you a reset link.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                        disabled={isLoading}
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

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 bg-brand-primary text-white hover:bg-brand-primary/95 shadow-sm transition-all focus-visible:ring-brand-primary mt-2"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending reset link...
                      </span>
                    ) : (
                      'Send Reset Link'
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
                <h3 className="text-lg font-bold text-text-primary mb-2">Check your email</h3>
                <p className="text-xs text-text-muted max-w-sm mb-6 leading-relaxed">
                  We have sent a password reset link to your email address. Please check your inbox and spam folder.
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
