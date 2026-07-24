import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Ingest a URL (YouTube video, web page/article, online book, or PDF link) as a
 * grounding document. Proxies to the backend, which fetches the content and
 * indexes it through the same pipeline as uploaded files. Poll
 * /api/documents/[id]/status for indexing progress, same as uploads.
 */
export async function POST(request: Request) {
  try {
    const { url, workspaceId } = (await request.json()) as {
      url?: string
      workspaceId?: string | null
    }
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ message: 'No URL provided' }, { status: 400 })
    }
    if (workspaceId && !mockDb.userOwnsWorkspace(workspaceId, getUserIdFromRequest(request))) {
      return NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
    }

    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/documents/ingest-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url, workspaceId }),
      })

      if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => ({}))
        console.warn('Backend URL ingestion failed:', errorData)
        return NextResponse.json(
          { message: errorData.detail || 'Backend URL ingestion failed' },
          { status: backendResponse.status }
        )
      }

      const backendResult = await backendResponse.json()

      // Register in the local mock DB so it appears in the workspace document
      // list. Content is stored server-side as extracted text, so 'txt' fits.
      const doc = mockDb.addDocument(
        backendResult.filename || url,
        0,
        'txt',
        workspaceId || null,
        backendResult.document_id
      )

      return NextResponse.json(
        {
          ...doc,
          backendDocumentId: backendResult.document_id,
          backendStatus: backendResult.status,
        },
        { status: 201 }
      )
    } catch (backendError) {
      // Same policy as file uploads: never fake success, or the user would be
      // querying a source the RAG index doesn't actually contain.
      console.error('Backend not available for URL ingestion:', backendError)
      return NextResponse.json(
        {
          message:
            'Could not reach the backend to index this link. Please ensure the backend is running and try again.',
        },
        { status: 503 }
      )
    }
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
