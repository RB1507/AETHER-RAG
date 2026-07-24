import fs from 'node:fs'
import path from 'node:path'
import {
  Workspace,
  Document,
  Conversation,
  Message,
  AnalyticsData,
  Citation,
  RetrievedChunk,
} from '@/types'

/**
 * Resolve the writable data directory. In the packaged desktop app the Electron
 * launcher sets AETHERRAG_DATA_DIR to the user's writable userData folder; in
 * dev we fall back to a local .data/ dir. The store is a JSON file there, so
 * conversations/workspaces/documents survive restarts.
 */
function dataDir(): string {
  const dir = process.env.AETHERRAG_DATA_DIR || path.join(process.cwd(), '.data')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // Best-effort; persistence degrades gracefully to in-memory only.
  }
  return dir
}

// Disk-backed store for app metadata (the RAG documents/embeddings themselves
// live in the backend's ChromaDB + SQLite). Starts empty — no demo seed data.
class MockDb {
  public workspaces: Workspace[] = []
  public documents: Document[] = []
  public conversations: Conversation[] = []
  public messages: Message[] = []
  public analytics: AnalyticsData = {
    totalTokens: 0,
    totalQueries: 0,
    totalDocuments: 0,
    avgResponseTime: 0,
    dailyUsage: [],
    topDocuments: [],
  }

  private readonly file = path.join(dataDir(), 'app-data.json')

  constructor() {
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        this.workspaces = raw.workspaces ?? this.workspaces
        this.documents = raw.documents ?? this.documents
        this.conversations = raw.conversations ?? this.conversations
        this.messages = raw.messages ?? this.messages
        this.analytics = raw.analytics ?? this.analytics
      }
    } catch {
      // Corrupt/unreadable store — start clean rather than crash.
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(
        this.file,
        JSON.stringify(
          {
            workspaces: this.workspaces,
            documents: this.documents,
            conversations: this.conversations,
            messages: this.messages,
            analytics: this.analytics,
          },
          null,
          2
        )
      )
    } catch {
      // Best-effort persistence; ignore write failures.
    }
  }

  // Workspaces operations
  public addWorkspace(name: string, description?: string, ownerId?: string): Workspace {
    const ws: Workspace = {
      id: `ws_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      documentCount: 0,
      memberCount: 1,
      createdAt: new Date().toISOString(),
      ownerId,
    }
    this.workspaces.push(ws)
    this.save()
    return ws
  }

  /**
   * Workspaces visible to a user. Legacy rows without an owner are claimed by
   * the first authenticated account that lists them — on this single-user
   * desktop app that is the machine's original account, and it prevents data
   * created before ownership existed from leaking into every later account.
   */
  public workspacesFor(ownerId: string): Workspace[] {
    let claimed = false
    for (const ws of this.workspaces) {
      if (!ws.ownerId) {
        ws.ownerId = ownerId
        claimed = true
      }
    }
    if (claimed) this.save()
    return this.workspaces.filter((w) => w.ownerId === ownerId)
  }

  /** True if the workspace exists and belongs to this user. */
  public userOwnsWorkspace(workspaceId: string | null, ownerId: string | null): boolean {
    if (!workspaceId || !ownerId) return false
    return this.workspaces.some((w) => w.id === workspaceId && w.ownerId === ownerId)
  }

  /** True if the conversation lives in a workspace owned by this user. */
  public userOwnsConversation(conversationId: string, ownerId: string | null): boolean {
    const conv = this.conversations.find((c) => c.id === conversationId)
    if (!conv) return false
    return this.userOwnsWorkspace(conv.workspaceId, ownerId)
  }

  public deleteWorkspace(id: string): boolean {
    const idx = this.workspaces.findIndex((w) => w.id === id)
    if (idx !== -1) {
      this.workspaces.splice(idx, 1)
      // Cascade delete documents & conversations
      this.documents = this.documents.filter((d) => d.workspaceId !== id)
      const convIds = this.conversations.filter((c) => c.workspaceId === id).map((c) => c.id)
      this.conversations = this.conversations.filter((c) => c.workspaceId !== id)
      this.messages = this.messages.filter((m) => !convIds.includes(m.conversationId))
      this.save()
      return true
    }
    return false
  }

  // Documents operations
  public addDocument(
    name: string,
    size: number,
    type: 'pdf' | 'docx' | 'txt' | 'csv' | 'md',
    workspaceId: string | null,
    backendDocumentId?: string
  ): Document {
    const doc: Document = {
      id: `doc_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      size,
      status: 'ready', // standard starts ready for ease
      pageCount: Math.max(1, Math.floor(size / 10000)),
      chunkCount: Math.max(1, Math.floor(size / 2000)),
      workspaceId,
      uploadedAt: new Date().toISOString(),
      backendDocumentId,
    }
    this.documents.push(doc)

    // Update document count in workspace
    if (workspaceId) {
      const ws = this.workspaces.find((w) => w.id === workspaceId)
      if (ws) ws.documentCount += 1
    }

    // Update analytics
    this.analytics.totalDocuments += 1

    this.save()
    return doc
  }

  public deleteDocument(id: string): boolean {
    const idx = this.documents.findIndex((d) => d.id === id)
    if (idx !== -1) {
      const doc = this.documents[idx]
      this.documents.splice(idx, 1)

      // Update workspace doc count
      if (doc.workspaceId) {
        const ws = this.workspaces.find((w) => w.id === doc.workspaceId)
        if (ws) ws.documentCount = Math.max(0, ws.documentCount - 1)
      }
      this.analytics.totalDocuments = Math.max(0, this.analytics.totalDocuments - 1)
      this.save()
      return true
    }
    return false
  }

  // Conversations operations
  public addConversation(title: string, workspaceId: string | null): Conversation {
    const conv: Conversation = {
      id: `conv_${Math.random().toString(36).substr(2, 9)}`,
      title,
      workspaceId,
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.conversations.push(conv)
    this.save()
    return conv
  }

  public renameConversation(id: string, title: string): boolean {
    const conv = this.conversations.find((c) => c.id === id)
    if (!conv) return false
    const clean = title.trim()
    if (!clean) return false
    conv.title = clean
    conv.updatedAt = new Date().toISOString()
    this.save()
    return true
  }

  public deleteConversation(id: string): boolean {
    const idx = this.conversations.findIndex((c) => c.id === id)
    if (idx !== -1) {
      this.conversations.splice(idx, 1)
      this.messages = this.messages.filter((m) => m.conversationId !== id)
      this.save()
      return true
    }
    return false
  }

  // Messages operations
  public addMessage(
    role: 'user' | 'assistant',
    conversationId: string,
    content: string,
    citations: Citation[] = [],
    chunks: RetrievedChunk[] = []
  ): Message {
    const msg: Message = {
      id: `msg_${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      role,
      content,
      citations,
      chunks,
      createdAt: new Date().toISOString(),
    }
    this.messages.push(msg)

    // Update conversation message count and updatedAt
    const conv = this.conversations.find((c) => c.id === conversationId)
    if (conv) {
      conv.messageCount += 1
      conv.updatedAt = new Date().toISOString()
    }

    this.save()
    return msg
  }
}

// Global singleton to survive Next dev server module reloads.
const globalForDb = global as unknown as { db?: MockDb }
export const mockDb = globalForDb.db || new MockDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = mockDb
