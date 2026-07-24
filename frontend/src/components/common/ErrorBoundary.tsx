'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4 dark:bg-background">
          <Card className="w-full max-w-md border-border shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-danger dark:bg-red-950/30">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-bold text-text-primary">Something went wrong</CardTitle>
              <CardDescription className="text-sm text-text-muted">
                An unexpected error occurred in the application rendering cycle.
              </CardDescription>
            </CardHeader>
            {this.state.error && (
              <CardContent>
                <div className="rounded bg-muted p-3 text-left">
                  <p className="font-mono text-xs text-danger break-all">{this.state.error.toString()}</p>
                </div>
              </CardContent>
            )}
            <CardFooter className="flex justify-center">
              <Button onClick={this.handleReset} variant="outline" className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
