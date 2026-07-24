import * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export function PageLoader() {
  return (
    <div 
      role="status" 
      aria-label="Loading page" 
      className="flex min-h-screen w-full flex-col bg-background p-6"
    >
      {/* Top Navbar Skeleton */}
      <div className="flex h-16 w-full items-center justify-between border-b border-border/60 pb-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      
      {/* Main Workspace Skeleton layout */}
      <div className="flex flex-1 gap-6 pt-6">
        {/* Sidebar skeleton */}
        <div className="hidden w-64 flex-col gap-4 md:flex">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="flex flex-1 flex-col gap-3 pt-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        
        {/* Content body skeleton */}
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-3 max-h-[300px]">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div className="flex flex-col gap-4 pt-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
