'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { useUploadStore, UploadItem } from '@/stores/upload.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { UploadQueueItem } from '@/components/upload/UploadQueueItem'
import { Document } from '@/types'
import { ROUTES } from '@/constants/routes'

interface BackendStatus {
  document_id: string
  filename: string
  status: 'processing' | 'completed' | 'failed'
  chunk_count: number
  /** Human-readable reason, present when status === 'failed'. */
  error?: string
}

const POLL_INTERVAL_MS = 1500
const MAX_POLLS = 80 // ~2 min ceiling so a stuck job doesn't poll forever

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Drives the global upload queue and renders a cross-page progress indicator.
 *
 * Mounted once in the authenticated layout (which stays mounted across page
 * navigation), so uploads keep running and stay visible even after the user
 * leaves the workspace tab. Progress reflects the backend's real processing
 * status, polled via /api/documents/[id]/status — not a timer.
 */
export function UploadManager() {
  const uploads = useUploadStore((s) => s.uploads)
  const patch = useUploadStore((s) => s.patch)
  const remove = useUploadStore((s) => s.remove)
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const startedRef = React.useRef<Set<string>>(new Set())

  const finish = React.useCallback(
    (id: string, fileName: string, ok: boolean, workspaceId: string | null, errorMsg?: string) => {
      queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      useWorkspaceStore.getState().fetchWorkspaces()
      if (ok) toast.success(`Indexed ${fileName} successfully`)
      else toast.error(errorMsg ? `${fileName}: ${errorMsg}` : `Failed to index ${fileName}`)
      setTimeout(() => {
        remove(id)
        startedRef.current.delete(id)
      }, 4000)
    },
    [queryClient, remove]
  )

  const runUpload = React.useCallback(
    async (item: UploadItem) => {
      const { id, file, url, workspaceId, fileName } = item
      if (!file && !url) {
        patch(id, { status: 'failed', error: 'File missing' })
        return
      }
      try {
        let doc: Document
        if (url) {
          // URL source (YouTube/web page/PDF link): the backend fetches the
          // content itself, so there is no byte upload — go straight to
          // "indexing" and let the status polls below drive the outcome.
          patch(id, { status: 'processing', progress: 100 })
          doc = await apiClient.post<Document>('/documents/url', { url, workspaceId })
        } else {
          patch(id, { status: 'uploading', progress: 0 })

          const formData = new FormData()
          formData.append('file', file!)
          if (workspaceId) formData.append('workspaceId', workspaceId)

          // Real byte-level upload progress drives the percentage.
          doc = await apiClient.postWithProgress<Document>('/documents', formData, (pct) =>
            patch(id, { progress: pct })
          )
        }
        const backendId = doc.backendDocumentId

        patch(id, { status: 'processing', progress: 100, backendDocumentId: backendId })
        // Surface the new row immediately, even before indexing finishes.
        queryClient.invalidateQueries({ queryKey: ['documents', workspaceId] })

        if (!backendId) {
          patch(id, { status: 'completed', progress: 100 })
          finish(id, fileName, true, workspaceId)
          return
        }

        // Poll the backend for real processing status.
        for (let i = 0; i < MAX_POLLS; i++) {
          await sleep(POLL_INTERVAL_MS)
          let st: BackendStatus
          try {
            st = await apiClient.get<BackendStatus>(`/documents/${backendId}/status`)
          } catch {
            continue // transient error — keep polling
          }
          if (st.status === 'completed') {
            patch(id, { status: 'completed', progress: 100 })
            finish(id, fileName, true, workspaceId)
            return
          }
          if (st.status === 'failed') {
            const reason = st.error || 'Processing failed'
            patch(id, { status: 'failed', error: reason })
            finish(id, fileName, false, workspaceId, reason)
            return
          }
          // Still indexing — the backend reports no %, so leave the bar full
          // (upload done) with the "indexing" label until it completes.
        }

        // Polling ceiling hit — the doc is likely still processing; stop here.
        patch(id, { status: 'completed', progress: 100 })
        finish(id, fileName, true, workspaceId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        patch(id, { status: 'failed', error: message })
        toast.error(`Failed to upload ${fileName}: ${message}`)
        setTimeout(() => {
          remove(id)
          startedRef.current.delete(id)
        }, 4000)
      }
    },
    [patch, remove, queryClient, finish]
  )

  React.useEffect(() => {
    uploads.forEach((item) => {
      if (item.status === 'queued' && !startedRef.current.has(item.id)) {
        startedRef.current.add(item.id)
        void runUpload(item)
      }
    })
  }, [uploads, runUpload])

  // Cross-page floating indicator. Hidden on the workspace page, which renders
  // its own inline queue, to avoid showing the same uploads twice.
  const onWorkspacePage = pathname?.startsWith(ROUTES.MAIN.WORKSPACE)
  const showWidget = uploads.length > 0 && !onWorkspacePage

  return (
    <AnimatePresence>
      {showWidget && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-5 right-5 z-50 w-72 rounded-2xl border border-border/60 bg-surface-primary/95 dark:bg-card/95 backdrop-blur-md shadow-xl p-4 space-y-3"
        >
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            Vector Indexing Queue
          </p>
          {uploads.map((up) => (
            <UploadQueueItem key={up.id} item={up} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
