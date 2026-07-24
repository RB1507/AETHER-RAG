import * as React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function UserAvatar({
  name,
  src,
  size = 'md',
  className,
}: UserAvatarProps) {
  // Extract initials from name, handles empty or single word names
  const initials = React.useMemo(() => {
    if (!name) return 'U'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }, [name])

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base font-semibold',
  }

  return (
    <Avatar size={size === 'md' ? 'default' : size} className={cn(sizeClasses[size], 'border border-border/50 shadow-sm', className)}>
      {src && <AvatarImage src={src} alt={`${name}'s avatar`} />}
      <AvatarFallback className="bg-brand-primary/10 text-brand-primary font-medium select-none">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
