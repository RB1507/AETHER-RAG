import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { Layers, Loader2, Sparkles, Send, Paperclip, UploadCloud, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MessageBubble } from './MessageBubble'
import { ModelSelector } from './ModelSelector'
import { Message, Citation, Workspace, User } from '@/types'
import { useUploadStore } from '@/stores/upload.store'
import { UPLOAD_ACCEPT, APP_CONFIG } from '@/constants/config'
import { GettingStarted } from '@/components/onboarding/GettingStarted'

interface ChatAreaProps {
  activeWorkspace: Workspace | null
  conversationTitle: string
  // The model the backend actually generates with (configured server-side).
  // Null while loading or if the backend is unreachable.
  modelLabel: string | null
  isLoadingMessages: boolean
  messages: Message[]
  isStreaming: boolean
  streamText: string
  streamCitations: Citation[]
  inputText: string
  setInputText: (text: string) => void
  handleSendMessage: (e?: React.FormEvent) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  messageEndRef: React.RefObject<HTMLDivElement | null>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  user: User | null
  handleCitationClick: (citations: Citation[], text: string) => void
  onSourceClick: (citation: Citation) => void
}

export function ChatArea({
  activeWorkspace,
  conversationTitle,
  modelLabel,
  isLoadingMessages,
  messages,
  isStreaming,
  streamText,
  streamCitations,
  inputText,
  setInputText,
  handleSendMessage,
  handleKeyDown,
  messageEndRef,
  textareaRef,
  user,
  handleCitationClick,
  onSourceClick,
}: ChatAreaProps) {
  // Files attached in the chat go through the same global upload queue as the
  // workspace page: the UploadManager uploads + indexes them into the active
  // workspace, and its floating widget shows progress on this page.
  const enqueue = useUploadStore((s) => s.enqueue)

  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      if (!activeWorkspace) {
        toast.warning('Select a workspace before attaching files')
        return
      }
      enqueue(
        acceptedFiles.map((file) => ({
          id: `up_${crypto.randomUUID()}`,
          fileName: file.name,
          workspaceId: activeWorkspace.id,
          status: 'queued' as const,
          progress: 0,
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
          file,
        }))
      )
    },
    [activeWorkspace, enqueue]
  )

  // Link attachments (YouTube videos, web pages, online books, PDF links) go
  // through the same queue — the backend fetches and indexes the content.
  const [linkUrl, setLinkUrl] = React.useState('')
  const [isLinkOpen, setIsLinkOpen] = React.useState(false)

  const handleAddLink = () => {
    const raw = linkUrl.trim()
    if (!raw) return
    if (!activeWorkspace) {
      toast.warning('Select a workspace before attaching links')
      return
    }
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
      new URL(url)
    } catch {
      toast.error('That does not look like a valid link')
      return
    }
    enqueue([
      {
        id: `up_${crypto.randomUUID()}`,
        fileName: url,
        workspaceId: activeWorkspace.id,
        status: 'queued' as const,
        progress: 0,
        sizeBytes: 0,
        uploadedAt: new Date().toISOString(),
        url,
      },
    ])
    setLinkUrl('')
    setIsLinkOpen(false)
  }

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    onDropRejected: (rejections) => {
      rejections.slice(0, 3).forEach((r) => {
        const reason =
          r.errors[0]?.code === 'file-too-large'
            ? 'exceeds the 50MB limit'
            : 'is not a supported file type'
        toast.error(`${r.file.name} ${reason}`)
      })
    },
    accept: UPLOAD_ACCEPT,
    maxSize: APP_CONFIG.UPLOADS.MAX_SIZE_BYTES,
    // The whole chat pane is a drop target, but only the paperclip button
    // opens the file picker — plain clicks/keys must keep their normal behavior.
    noClick: true,
    noKeyboard: true,
  })

  return (
    <div
      {...getRootProps({
        className:
          'flex-1 flex flex-col h-full bg-surface-secondary/30 dark:bg-background/25 overflow-hidden relative',
      })}
    >
      <input {...getInputProps()} />

      {/* Drag-over overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-30 bg-brand-primary/10 backdrop-blur-[2px] border-2 border-dashed border-brand-primary flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="h-10 w-10 text-brand-primary mb-3" />
          <p className="text-sm font-bold text-text-primary">
            Drop files to add them to {activeWorkspace?.name ?? 'this workspace'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            PDF, DOCX, TXT, CSV, MD, or images — indexed for grounded answers
          </p>
        </div>
      )}
      {/* Chat Pane Header */}
      <div className="h-16 border-b border-border/50 bg-surface-primary/45 dark:bg-card/10 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <Layers className="h-4.5 w-4.5 text-brand-primary hidden sm:block shrink-0" />
          <div className="truncate leading-tight">
            <h2 className="text-xs font-bold text-text-primary truncate">
              {activeWorkspace ? activeWorkspace.name : 'Workspace Chat'}
            </h2>
            <p className="text-[10px] text-text-muted truncate">{conversationTitle}</p>
          </div>
        </div>

        {/* Model / provider selector — switches the backend LLM live. */}
        <div className="flex items-center gap-2">
          <ModelSelector />
        </div>
      </div>

      {/* Message scroll list */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
        {isLoadingMessages ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-3" />
            <span className="text-xs">Loading message history...</span>
          </div>
        ) : messages.length === 0 && !isStreaming && (activeWorkspace?.documentCount ?? 0) === 0 ? (
          // Workspace has no knowledge yet — guide the user through adding
          // files/links and asking a first question, right here in the chat.
          <div className="flex justify-center py-12">
            <GettingStarted onAskSample={setInputText} />
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <div className="max-w-xl mx-auto text-center py-12 space-y-4">
            <div className="h-12 w-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">
              Chat grounded in {activeWorkspace?.name}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed max-w-sm mx-auto">
              Ask anything about the documents in this workspace. All query responses are grounded in
              source files.
            </p>

            {/* Quick suggestions */}
            {activeWorkspace?.id === 'ws_engineering' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto pt-4">
                {[
                  'How do I run the dev server?',
                  'What is the rate limit for API v2.0?',
                  'What container engine does our architecture use?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInputText(q)}
                    className="text-left p-3 rounded-xl border border-border/60 hover:border-brand-primary/45 bg-surface-primary hover:bg-muted/30 text-xs font-medium text-text-secondary transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {activeWorkspace?.id === 'ws_marketing' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto pt-4">
                {[
                  'When is the Q3 Product launch scheduled?',
                  'What social hashtags are recommended?',
                  'What campaigns kick off on August 15?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInputText(q)}
                    className="text-left p-3 rounded-xl border border-border/60 hover:border-brand-primary/45 bg-surface-primary hover:bg-muted/30 text-xs font-medium text-text-secondary transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {activeWorkspace && !['ws_engineering', 'ws_marketing'].includes(activeWorkspace.id) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto pt-4">
                {[
                  'Summarize the key points of my documents',
                  'What are the main topics covered?',
                  'Explain the most important details',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInputText(q)}
                    className="text-left p-3 rounded-xl border border-border/60 hover:border-brand-primary/45 bg-surface-primary hover:bg-muted/30 text-xs font-medium text-text-secondary transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                citations={msg.citations}
                userName={user?.name}
                modelName={modelLabel ?? 'Assistant'}
                onCitationClick={handleCitationClick}
                onSourceClick={onSourceClick}
              />
            ))}

            {/* Streaming AI response */}
            {isStreaming && (
              <MessageBubble
                role="assistant"
                content={streamText}
                citations={streamCitations}
                isStreaming={true}
                modelName={modelLabel ?? 'Assistant'}
                onCitationClick={handleCitationClick}
                onSourceClick={onSourceClick}
              />
            )}
          </div>
        )}
        <div ref={messageEndRef} />
      </div>

      {/* Input Bar Section */}
      <div className="p-4 sm:p-6 border-t border-border/50 bg-surface-primary/45 dark:bg-card/10 backdrop-blur-md shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-2xl mx-auto relative flex items-end gap-2.5 bg-surface-primary dark:bg-card border border-border/80 focus-within:border-brand-primary/65 rounded-2xl p-2.5 shadow-sm transition-all">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={openFilePicker}
            title="Attach files — they are indexed into this workspace and become part of its knowledge base"
            className="h-9 w-9 rounded-xl shrink-0 text-text-muted hover:text-brand-primary self-center"
          >
            <Paperclip className="h-4.5 w-4.5" />
          </Button>
          <Popover open={isLinkOpen} onOpenChange={setIsLinkOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Attach a link — YouTube video, article, or online book to index into this workspace"
                  className="h-9 w-9 rounded-xl shrink-0 text-text-muted hover:text-brand-primary self-center"
                >
                  <Link2 className="h-4.5 w-4.5" />
                </Button>
              }
            />
            <PopoverContent side="top" align="start" className="w-80 p-3 space-y-2">
              <p className="text-xs font-bold text-text-primary">Add a link as grounding</p>
              <p className="text-[10px] text-text-muted leading-relaxed">
                YouTube videos (transcript), articles, online books, or direct PDF links. The
                content is indexed so you can ask questions about it.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddLink()
                    }
                  }}
                  placeholder="https://youtube.com/watch?v=..."
                  className="h-8 text-xs"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim()}
                  className="h-8 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-lg shrink-0"
                >
                  Add
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              conversationTitle !== 'New Conversation' ? 'Ask anything about workspace documents...' : 'Send a message to start chat...'
            }
            className="flex-1 max-h-40 min-h-9 resize-none bg-transparent border-0 px-2.5 py-2 text-xs outline-none text-text-primary placeholder-text-muted self-center leading-normal"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isStreaming || !inputText.trim()}
            className="h-9 w-9 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl shrink-0 flex items-center justify-center shadow-sm disabled:opacity-45"
          >
            {isStreaming ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Send className="h-4.5 w-4.5" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-text-muted text-center mt-2.5">
          AETHER RAG matches query parameters against your vector indices. Answers might contain bracketed grounding citations.
        </p>
      </div>
    </div>
  )
}
