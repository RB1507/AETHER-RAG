'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles, UploadCloud, Link2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useUploadStore } from '@/stores/upload.store'
import { UPLOAD_ACCEPT } from '@/constants/config'

const ACCEPT_ATTR = Object.values(UPLOAD_ACCEPT).flat().join(',')

const SAMPLE_QUESTIONS = [
  'Summarize the key points of my documents',
  'What are the main topics covered?',
]

interface GettingStartedProps {
  /**
   * When rendered inside the chat, clicking a sample question seeds the chat
   * input instead of navigating. Omit on pages without a chat input.
   */
  onAskSample?: (question: string) => void
  className?: string
}

/**
 * Guided first-use flow: create a workspace, add knowledge (files or links),
 * ask a question. Each step exposes its action inline so a new user is never
 * sent hunting through the sidebar or another page. Steps complete live as
 * the underlying state changes (workspace created, first document indexed).
 */
export function GettingStarted({ onAskSample, className }: GettingStartedProps) {
  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId, addWorkspace } =
    useWorkspaceStore()
  const enqueue = useUploadStore((s) => s.enqueue)
  const uploads = useUploadStore((s) => s.uploads)

  const activeWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) || null
  const pendingCount = uploads.filter(
    (u) =>
      u.workspaceId === selectedWorkspaceId &&
      u.status !== 'completed' &&
      u.status !== 'failed'
  ).length

  const step1Done = !!activeWorkspace
  const step2Done = (activeWorkspace?.documentCount ?? 0) > 0

  const [wsName, setWsName] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)
  const [linkUrl, setLinkUrl] = React.useState('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wsName.trim() || isCreating) return
    setIsCreating(true)
    try {
      const ws = await addWorkspace(wsName.trim())
      setSelectedWorkspaceId(ws.id)
      setWsName('')
    } catch {
      toast.error('Could not create the workspace. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const enqueueFiles = (files: File[]) => {
    if (!activeWorkspace || files.length === 0) return
    enqueue(
      files.map((file) => ({
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
  }

  const handleAddLink = () => {
    const raw = linkUrl.trim()
    if (!raw || !activeWorkspace) return
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
  }

  const steps: { title: string; done: boolean; active: boolean }[] = [
    { title: 'Create your workspace', done: step1Done, active: !step1Done },
    { title: 'Add files or links', done: step2Done, active: step1Done && !step2Done },
    { title: 'Ask your first question', done: false, active: step1Done && step2Done },
  ]

  return (
    <Card
      className={cn(
        'w-full max-w-lg border border-border/60 bg-surface-primary/85 dark:bg-card/75 backdrop-blur-md rounded-2xl shadow-lg',
        className
      )}
    >
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-brand-primary/10 text-brand-primary rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Get started in 3 steps</h3>
            <p className="text-xs text-text-muted">
              Set up once, then ask questions about anything you add.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {steps.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              {/* Step indicator */}
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5',
                  step.done
                    ? 'bg-success/15 text-success'
                    : step.active
                      ? 'bg-brand-primary text-white'
                      : 'bg-muted text-text-muted'
                )}
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold leading-6',
                    step.done || step.active ? 'text-text-primary' : 'text-text-muted'
                  )}
                >
                  {step.title}
                  {step.done && i === 1 && activeWorkspace && (
                    <span className="text-text-muted font-normal">
                      {' '}
                      — {activeWorkspace.documentCount} indexed
                    </span>
                  )}
                </p>

                {/* Step 1: inline workspace creation */}
                {i === 0 && step.active && (
                  <form onSubmit={handleCreate} className="flex items-center gap-2">
                    <Input
                      value={wsName}
                      onChange={(e) => setWsName(e.target.value)}
                      placeholder="e.g. My Notes, Study Material..."
                      className="h-9 text-xs"
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!wsName.trim() || isCreating}
                      className="h-9 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-lg shrink-0"
                    >
                      {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                    </Button>
                  </form>
                )}

                {/* Step 2: add files or links */}
                {i === 1 && step.active && (
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPT_ATTR}
                      className="hidden"
                      onChange={(e) => {
                        enqueueFiles(Array.from(e.target.files ?? []))
                        e.target.value = ''
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 rounded-lg text-xs w-full justify-start gap-2"
                    >
                      <UploadCloud className="h-4 w-4 text-brand-primary" />
                      Upload files (PDF, DOCX, TXT, images...)
                    </Button>
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-brand-primary shrink-0" />
                      <Input
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddLink()
                          }
                        }}
                        placeholder="or paste a YouTube / article link"
                        className="h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddLink}
                        disabled={!linkUrl.trim()}
                        className="h-9 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-lg shrink-0"
                      >
                        Add
                      </Button>
                    </div>
                    {pendingCount > 0 && (
                      <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin text-brand-primary" />
                        Indexing {pendingCount} item{pendingCount > 1 ? 's' : ''}... this step
                        completes automatically.
                      </p>
                    )}
                  </div>
                )}

                {/* Step 3: ask a question */}
                {i === 2 && step.active && (
                  <div className="space-y-2">
                    {onAskSample ? (
                      <div className="flex flex-col gap-2">
                        {SAMPLE_QUESTIONS.map((q) => (
                          <button
                            key={q}
                            onClick={() => onAskSample(q)}
                            className="text-left px-3 py-2 rounded-lg border border-border/60 hover:border-brand-primary/45 bg-surface-primary hover:bg-muted/30 text-xs text-text-secondary transition-all"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-brand-primary" />
                        Open AI Chat and ask anything about what you added.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
