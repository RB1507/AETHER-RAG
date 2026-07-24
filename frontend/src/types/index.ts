export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  plan: 'free' | 'pro' | 'enterprise'
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  workspaceId: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface RetrievedChunk {
  id: string
  documentId: string
  documentName: string
  content: string
  score: number          // 0-1 cosine similarity
  pageNumber?: number
  highlight?: string     // substring to highlight
}

export interface Citation {
  index: number          // [1], [2] in rendered text
  documentId: string
  documentName: string
  excerpt: string
  pageNumber?: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  chunks: RetrievedChunk[]
  tokensUsed?: number
  createdAt: string
}

export interface Document {
  id: string
  name: string
  type: 'pdf' | 'docx' | 'txt' | 'csv' | 'md'
  size: number           // bytes
  status: 'queued' | 'processing' | 'ready' | 'failed'
  pageCount?: number
  chunkCount?: number
  workspaceId: string | null
  uploadedAt: string
  // ID of the document in the Python/RAG backend (ChromaDB). Stored so deletes
  // can cascade to the backend and remove the file + chunks, not just this row.
  backendDocumentId?: string
}

export interface Workspace {
  id: string
  name: string
  description?: string
  documentCount: number
  memberCount: number
  createdAt: string
  /**
   * Email (JWT sub) of the account that created the workspace. All contained
   * conversations/documents are scoped through this. Absent on rows created
   * before ownership existed — those are claimed by the first account to load
   * them (single-machine app, so that's the machine's original user).
   */
  ownerId?: string
}

export interface AnalyticsData {
  totalTokens: number
  totalQueries: number
  totalDocuments: number
  avgResponseTime: number   // ms
  dailyUsage: { date: string; tokens: number; queries: number }[]
  topDocuments: { documentId: string; name: string; queryCount: number }[]
}

// SSE streaming event definitions
export type SSEEvent =
  | { type: 'token'; data: { text: string } }
  | { type: 'retrieval'; data: { chunks: RetrievedChunk[] } }
  | { type: 'citation'; data: { citations: Citation[] } }
  | { type: 'done'; data: { messageId: string; tokensUsed: number } }
  | { type: 'error'; data: { code: string; message: string } }
