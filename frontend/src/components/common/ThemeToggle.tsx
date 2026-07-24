'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

const emptySubscribe = () => () => {}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const isClient = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  if (!isClient) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        aria-label="Toggle visual theme"
        className="w-9 h-9"
      >
        <Sun className="h-5 w-5 opacity-50" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Toggle theme (currently ${theme})`}
      className="text-text-secondary hover:text-text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:outline-none w-9 h-9 relative"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
