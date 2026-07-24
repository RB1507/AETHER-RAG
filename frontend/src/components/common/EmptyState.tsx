import * as React from 'react'
import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-text-muted">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-text-muted leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button 
          onClick={onAction} 
          variant="default" 
          className="bg-brand-primary text-white hover:bg-brand-primary/90 shadow-sm focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
