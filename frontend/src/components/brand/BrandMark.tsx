import * as React from 'react'

/**
 * AETHER RAG brand mark — three stacked isometric layers (knowledge base /
 * embeddings). Drawn with `currentColor` so it inherits the surrounding text
 * color (white on the brand-primary tile). Size it with `className` (e.g.
 * "h-5 w-5") exactly like a lucide icon.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M48 52 L76 66 L48 80 L20 66 Z" fill="currentColor" opacity="0.45" />
      <path d="M48 34 L76 48 L48 62 L20 48 Z" fill="currentColor" opacity="0.72" />
      <path d="M48 16 L76 30 L48 44 L20 30 Z" fill="currentColor" />
    </svg>
  )
}
