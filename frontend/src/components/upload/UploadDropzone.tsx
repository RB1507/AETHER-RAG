import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { UploadCloud, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useUploadStore } from '@/stores/upload.store'
import { UploadQueueItem } from '@/components/upload/UploadQueueItem'
import { UPLOAD_ACCEPT, APP_CONFIG } from '@/constants/config'

interface UploadDropzoneProps {
  selectedWorkspaceId: string | null
}

export function UploadDropzone({ selectedWorkspaceId }: UploadDropzoneProps) {
  const enqueue = useUploadStore((s) => s.enqueue)
  // Show this workspace's uploads. The actual work (upload + status polling) runs
  // in the global UploadManager so progress survives leaving this page.
  const allUploads = useUploadStore((s) => s.uploads)
  const uploads = allUploads.filter((u) => u.workspaceId === selectedWorkspaceId)

  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      if (!selectedWorkspaceId) {
        toast.warning('Please select or create a workspace first')
        return
      }
      enqueue(
        acceptedFiles.map((file) => ({
          id: `up_${crypto.randomUUID()}`,
          fileName: file.name,
          workspaceId: selectedWorkspaceId,
          status: 'queued' as const,
          progress: 0,
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
          file,
        }))
      )
    },
    [selectedWorkspaceId, enqueue]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: UPLOAD_ACCEPT,
    maxSize: APP_CONFIG.UPLOADS.MAX_SIZE_BYTES,
  })

  return (
    <div className="md:col-span-1 space-y-6">
      <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Upload Groundings</CardTitle>
          <CardDescription className="text-[10px]">
            Add references to feed the RAG system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150',
              isDragActive
                ? 'border-brand-primary bg-brand-primary/5'
                : 'border-border hover:border-brand-primary/50'
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-9 w-9 text-text-muted mb-3" />
            <p className="text-xs font-semibold text-text-primary">Drag & drop files here</p>
            <p className="text-[10px] text-text-muted mt-1 max-w-[170px] leading-relaxed">
              PDF, DOCX, TXT, or images (PNG/JPG — OCR&apos;d) up to 50MB.
            </p>
          </div>

          <AnimatePresence>
            {uploads.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Vector Indexing Queue
                </p>
                <p className="text-[9px] text-text-muted -mt-2 leading-relaxed">
                  Uploads keep running if you leave this page.
                </p>
                {uploads.map((up) => (
                  <UploadQueueItem key={up.id} item={up} />
                ))}
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="rounded-2xl bg-brand-primary/5 border border-brand-primary/10 p-4 space-y-2">
        <h4 className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
          <Info className="h-4 w-4" />
          How Grounding Works
        </h4>
        <p className="text-[10px] text-text-secondary leading-relaxed">
          When you upload files, AETHER RAG sends them to the backend which chunks them into logical passages, computes vector
          embeddings, and stores them in ChromaDB. When you query the AI chat, the system performs a hybrid
          similarity search to retrieve relevant context and generates grounded answers.
        </p>
      </div>
    </div>
  )
}
