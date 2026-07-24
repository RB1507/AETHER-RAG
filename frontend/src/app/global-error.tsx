'use client'

import * as React from 'react'
import { Inter } from 'next/font/google'
import '@/app/globals.css' // Needed for tailwind

const inter = Inter({ subsets: ['latin'] })

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('Fatal global error:', error)
  }, [error])

  return (
    <html lang="en" className={inter.className}>
      <body>
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-50">
          <div className="flex max-w-md flex-col items-center text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-red-500">Fatal Application Error</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                A critical error occurred that could not be recovered from.
              </p>
            </div>
            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => reset()}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-md font-medium text-sm hover:bg-zinc-200 transition-colors"
              >
                Try again
              </button>
              <button 
                onClick={() => window.location.href = '/'}
                className="px-4 py-2 bg-zinc-800 text-zinc-100 rounded-md font-medium text-sm hover:bg-zinc-700 transition-colors border border-zinc-700"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
