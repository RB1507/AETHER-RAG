'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('Unhandled application error:', error)
  }, [error])

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-surface-secondary dark:bg-background p-6">
      <div className="flex max-w-md flex-col items-center text-center space-y-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger/10 text-danger shadow-sm">
          <AlertTriangle className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary tracking-tight">Something went wrong!</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            An unexpected error occurred while processing your request. Please try again or contact support if the issue persists.
          </p>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => reset()} variant="default" className="min-w-[120px]">
            Try again
          </Button>
          <Button onClick={() => window.location.href = '/'} variant="outline" className="min-w-[120px]">
            Go home
          </Button>
        </div>
      </div>
    </div>
  )
}
