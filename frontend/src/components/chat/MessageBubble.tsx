import * as React from 'react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { markdownRehypePlugins, markdownRemarkPlugins, markdownTypographyClass } from '@/lib/markdown'
import { BookOpen, Loader2 } from 'lucide-react'
import { Citation } from '@/types'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
  userName?: string
  modelName: string
  onCitationClick: (citations: Citation[], text: string) => void
  onSourceClick: (citation: Citation) => void
}

// Memoized: during streaming a new token re-renders the chat list; memoization
// keeps already-rendered messages from re-rendering on every token.
export const MessageBubble = React.memo(function MessageBubble({
  role,
  content,
  citations = [],
  isStreaming = false,
  userName = 'User',
  modelName,
  onCitationClick,
  onSourceClick,
}: MessageBubbleProps) {
  return (
    <div className={cn('flex flex-col space-y-1.5', role === 'user' ? 'items-end' : 'items-start')}>
      {/* Speaker Label */}
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-1 flex items-center gap-1.5">
        {isStreaming && role === 'assistant' && (
          <Loader2 className="h-3 w-3 animate-spin text-brand-primary shrink-0" />
        )}
        {role === 'user' ? userName : isStreaming ? `${modelName.toUpperCase()} is writing...` : modelName.toUpperCase()}
      </span>

      {/* Chat Message Bubble */}
      <div
        className={cn(
          'p-4 rounded-2xl max-w-[85%] text-xs shadow-xs leading-relaxed border',
          role === 'user'
            ? 'bg-brand-primary text-white border-brand-primary/80 rounded-tr-none'
            : 'bg-surface-primary dark:bg-card border-border/70 text-text-primary rounded-tl-none'
        )}
      >
        {role === 'user' ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : isStreaming && !content ? (
          <div className="flex items-center gap-1 py-1.5">
            <span className="h-1.5 w-1.5 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 bg-brand-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 bg-brand-primary rounded-full animate-bounce" />
          </div>
        ) : (
          <div className={markdownTypographyClass}>
            <ReactMarkdown
              remarkPlugins={markdownRemarkPlugins}
              rehypePlugins={markdownRehypePlugins}
              components={{
                a: ({ ...props }) => {
                  const text = props.children?.toString() || ''
                  if (/^\[\d+\]$/.test(text)) {
                    return (
                      <button
                        onClick={() => onCitationClick(citations, text)}
                        className="px-1 text-[11px] font-bold text-brand-primary hover:underline bg-brand-primary/10 rounded cursor-pointer mx-0.5 select-none align-baseline inline-block"
                        type="button"
                      >
                        {text}
                      </button>
                    )
                  }
                  return <a {...props} />
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Grounded Citations Bar (AI responses only) */}
      {role === 'assistant' && citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 px-1 max-w-[85%]">
          <span className="text-[9px] font-bold text-text-muted flex items-center gap-1 mr-1">
            <BookOpen className="h-3 w-3 shrink-0" />
            Grounded Sources:
          </span>
          {citations.map((c) => (
            <button
              key={c.index}
              onClick={() => onSourceClick(c)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/65 hover:bg-muted text-[10px] text-text-secondary border border-border/55 cursor-pointer max-w-[170px] truncate"
            >
              <span className="font-bold text-brand-primary shrink-0 select-none">[{c.index}]</span>
              <span className="truncate">{c.documentName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
