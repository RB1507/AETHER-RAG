import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: Request) {
  const uid = getUserIdFromRequest(request)
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspaceId')

  if (workspaceId) {
    if (!mockDb.userOwnsWorkspace(workspaceId, uid)) {
      return NextResponse.json([])
    }
    return NextResponse.json(mockDb.documents.filter((d) => d.workspaceId === workspaceId))
  }

  if (!uid) return NextResponse.json([])
  const ownedIds = new Set(mockDb.workspacesFor(uid).map((w) => w.id))
  return NextResponse.json(
    mockDb.documents.filter((d) => d.workspaceId && ownedIds.has(d.workspaceId))
  )
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('Content-Type') || ''

    // Handle multipart file upload — proxy to backend
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const workspaceId = formData.get('workspaceId') as string | null

      if (!file) {
        return NextResponse.json({ message: 'No file provided' }, { status: 400 })
      }
      if (workspaceId && !mockDb.userOwnsWorkspace(workspaceId, getUserIdFromRequest(request))) {
        return NextResponse.json({ message: 'Workspace not found' }, { status: 404 })
      }

      // Get auth token
      const authHeader = request.headers.get('Authorization') || ''
      const token = authHeader.replace('Bearer ', '')

      try {
        // Forward file to backend, including the workspace so chunks are
        // stamped for per-user/per-workspace retrieval scoping.
        const backendFormData = new FormData()
        backendFormData.append('file', file)
        if (workspaceId) backendFormData.append('workspaceId', workspaceId)

        const backendResponse = await fetch(`${BACKEND_URL}/api/documents/upload`, {
          method: 'POST',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: backendFormData,
        })

        if (backendResponse.ok) {
          const backendResult = await backendResponse.json()

          // Also register in local mock DB for the workspace view
          const fileExt = file.name.split('.').pop()?.toLowerCase() as 'pdf' | 'docx' | 'txt' | 'csv' | 'md'
          const doc = mockDb.addDocument(
            file.name,
            file.size,
            ['pdf', 'docx', 'txt', 'csv', 'md'].includes(fileExt) ? fileExt : 'txt',
            workspaceId || null,
            backendResult.document_id
          )

          // Return combined info
          return NextResponse.json({
            ...doc,
            backendDocumentId: backendResult.document_id,
            backendStatus: backendResult.status,
          }, { status: 201 })
        } else {
          const errorData = await backendResponse.json().catch(() => ({}))
          console.warn('Backend document upload failed:', errorData)
          return NextResponse.json(
            { message: errorData.detail || 'Backend upload failed' },
            { status: backendResponse.status }
          )
        }
      } catch (backendError) {
        // Do NOT fake success: if the backend is unreachable the document is
        // never embedded, so silently adding it to the display creates a "ghost"
        // document that the RAG index doesn't actually contain. Surface a real
        // error so the user can retry instead of querying a non-indexed file.
        console.error('Backend not available for upload:', backendError)
        return NextResponse.json(
          {
            message:
              'Could not reach the backend to index this document. Please ensure the backend is running and try again.',
          },
          { status: 503 }
        )
      }
    }

    // Handle JSON body (original mock behavior for backward compat)
    const { name, size, type, workspaceId } = await request.json()
    if (!name || !size || !type) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }
    const doc = mockDb.addDocument(name, size, type, workspaceId || null)
    return NextResponse.json(doc, { status: 201 })
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
