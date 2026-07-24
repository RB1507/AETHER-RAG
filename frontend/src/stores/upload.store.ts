import { create } from 'zustand'

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'completed' | 'failed'

export interface UploadItem {
  /** Client-generated id, stable for the lifetime of this upload. */
  id: string
  fileName: string
  workspaceId: string | null
  status: UploadStatus
  /** Upload progress, 0–100. Real byte progress while uploading. */
  progress: number
  /** File size in bytes. */
  sizeBytes: number
  /** ISO timestamp of when the upload was started. */
  uploadedAt: string
  /** Backend document id (doc_xxxx), set once the upload POST returns. */
  backendDocumentId?: string
  error?: string
  /** The File to upload. Held only until the upload starts; never persisted. */
  file?: File
  /**
   * A web/YouTube/book URL to ingest instead of a file. When set, the
   * UploadManager asks the backend to fetch and index the URL's content
   * (video transcript, PDF, or page text) rather than uploading bytes.
   */
  url?: string
}

interface UploadState {
  uploads: UploadItem[]
  /** Add freshly-dropped files to the global queue. The UploadManager picks them up. */
  enqueue: (items: UploadItem[]) => void
  patch: (id: string, partial: Partial<UploadItem>) => void
  remove: (id: string) => void
}

/**
 * Global upload queue. Lives outside the component tree so upload progress
 * survives navigation between pages — the UploadDropzone unmounts when you leave
 * the workspace tab, but the queue (and the UploadManager that drives it) does
 * not. State is in-memory only (not persisted) since it holds live File objects.
 */
export const useUploadStore = create<UploadState>((set) => ({
  uploads: [],
  enqueue: (items) => set((s) => ({ uploads: [...s.uploads, ...items] })),
  patch: (id, partial) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...partial } : u)),
    })),
  remove: (id) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),
}))
