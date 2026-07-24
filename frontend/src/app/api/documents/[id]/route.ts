import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Look up the local row so we know which backend document to purge.
  const doc = mockDb.documents.find((d) => d.id === id)
  if (!doc) {
    return NextResponse.json({ message: 'Document not found' }, { status: 404 })
  }

  // Cascade the delete to the RAG backend so the raw file AND its vector chunks
  // are removed — otherwise the document keeps grounding answers as a "ghost".
  if (doc.backendDocumentId) {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    try {
      const backendResponse = await fetch(
        `${BACKEND_URL}/api/documents/${doc.backendDocumentId}`,
        {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      // 404 means the backend already has no trace of it — safe to proceed and
      // clean up the local row. Any other failure is surfaced so the user can
      // retry instead of ending up with orphaned files/chunks on the backend.
      if (!backendResponse.ok && backendResponse.status !== 404) {
        const errorData = await backendResponse.json().catch(() => ({}))
        console.error('Backend document delete failed:', errorData)
        return NextResponse.json(
          { message: errorData.detail || 'Failed to delete document from the backend.' },
          { status: backendResponse.status }
        )
      }
    } catch (backendError) {
      console.error('Backend not available for delete:', backendError)
      return NextResponse.json(
        {
          message:
            'Could not reach the backend to remove this document. Please ensure the backend is running and try again.',
        },
        { status: 503 }
      )
    }
  }

  const success = mockDb.deleteDocument(id)
  if (success) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ message: 'Document not found' }, { status: 404 })
}
