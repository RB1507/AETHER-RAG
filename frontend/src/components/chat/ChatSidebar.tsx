import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Plus, MessageSquare, Trash2, Loader2, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Conversation } from '@/types'

interface ChatSidebarProps {
  conversations: Conversation[]
  isLoadingConvs: boolean
  activeConvId: string | null
  setActiveConvId: (id: string) => void
  handleCreateNewChat: () => void
  deleteConv: (id: string) => void
  renameConv: (id: string, title: string) => void
}

export function ChatSidebar({
  conversations,
  isLoadingConvs,
  activeConvId,
  setActiveConvId,
  handleCreateNewChat,
  deleteConv,
  renameConv,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draftTitle, setDraftTitle] = React.useState('')

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id)
    setDraftTitle(conv.title)
  }

  const commitEditing = () => {
    if (editingId) {
      const clean = draftTitle.trim()
      if (clean) renameConv(editingId, clean)
    }
    setEditingId(null)
    setDraftTitle('')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setDraftTitle('')
  }

  return (
    <div className="hidden sm:flex w-64 shrink-0 flex-col border-r border-border/60 bg-surface-primary/40 dark:bg-card/10 h-full p-4 space-y-4">
      <Button
        onClick={handleCreateNewChat}
        className="w-full bg-brand-primary text-white hover:bg-brand-primary/95 text-xs font-semibold h-10 rounded-xl shadow-sm flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" />
        New Chat
      </Button>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1.5">
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-2 mb-2">
          History
        </p>
        {isLoadingConvs ? (
          <div className="flex justify-center py-6 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-xs">No active chats</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => editingId !== conv.id && setActiveConvId(conv.id)}
              className={cn(
                'group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-150',
                activeConvId === conv.id
                  ? 'bg-muted/80 text-text-primary'
                  : 'text-text-secondary hover:bg-muted/40 hover:text-text-primary'
              )}
            >
              {editingId === conv.id ? (
                // Inline rename editor
                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                  <MessageSquare className="h-4 w-4 text-text-muted shrink-0" />
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEditing()
                      else if (e.key === 'Escape') cancelEditing()
                    }}
                    onBlur={commitEditing}
                    className="flex-1 min-w-0 bg-transparent border-b border-brand-primary/60 outline-none text-xs text-text-primary"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); commitEditing() }}
                    className="text-brand-primary hover:opacity-80 p-0.5"
                    title="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelEditing() }}
                    className="text-text-muted hover:text-danger p-0.5"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="flex items-center gap-2.5 min-w-0"
                    onDoubleClick={(e) => { e.stopPropagation(); startEditing(conv) }}
                    title="Double-click to rename"
                  >
                    <MessageSquare className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="truncate max-w-[110px]">{conv.title}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditing(conv) }}
                      className="opacity-0 group-hover:opacity-100 hover:text-brand-primary text-text-muted p-0.5 transition-all duration-150 rounded"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete conversation "${conv.title}"?`)) {
                          deleteConv(conv.id)
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-danger text-text-muted p-0.5 transition-all duration-150 rounded"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
