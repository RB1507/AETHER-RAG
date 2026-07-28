import * as React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { formatBytes, formatDate } from '@/lib/utils'
import { UploadItem } from '@/stores/upload.store'

const STATUS_LABEL: Record<UploadItem['status'], string> = {
  queued: 'queued',
  uploading: 'uploading',
  processing: 'indexing',
  completed: 'ready',
  failed: 'failed',
}

/**
 * One row in the upload queue. Shows the live upload percentage while bytes are
 * transferring, then the indexing state, plus the file size and upload date.
 * Shared by the inline dropzone queue and the cross-page floating widget.
 */
export function UploadQueueItem({ item }: { item: UploadItem }) {
  // Percentage is meaningful only during the byte transfer; the backend doesn't
  // report a % for indexing, so we show the status word there instead.
  const showPercent = item.status === 'queued' || item.status === 'uploading'

  return (
    <div className="space-y-1 text-left">
      <div className="flex justify-between items-center gap-2 text-[10px] font-medium text-text-primary">
        <span className="truncate font-semibold">{item.fileName}</span>
        <span className="text-brand-primary text-[9px] font-bold flex items-center gap-1.5 shrink-0 tabular-nums">
          {item.status === 'completed' ? (
            <CheckCircle className="h-3 w-3 text-success" />
          ) : item.status === 'failed' ? (
            <AlertCircle className="h-3 w-3 text-destructive" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          {showPercent ? `${item.progress}%` : STATUS_LABEL[item.status]}
        </span>
      </div>

      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          className={
            item.status === 'failed'
              ? 'h-full bg-destructive rounded-full'
              : 'h-full bg-brand-primary rounded-full'
          }
          initial={{ width: 0 }}
          animate={{ width: `${item.progress}%` }}
          transition={{ duration: 0.15 }}
        />
      </div>

      <p className="text-[9px] text-text-muted flex flex-wrap items-center gap-x-2">
        <span>{formatBytes(item.sizeBytes)}</span>
        <span>•</span>
        <span>Uploaded {formatDate(item.uploadedAt, 'short')}</span>
      </p>

      {item.status === 'failed' && item.error && (
        <p className="text-[9px] text-destructive leading-snug">{item.error}</p>
      )}
    </div>
  )
}
