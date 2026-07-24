import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Point the store at a throwaway temp dir before importing the module.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aetherrag-test-'))
process.env.AETHERRAG_DATA_DIR = tmp

type GlobalWithDb = typeof globalThis & { db?: unknown }

beforeEach(() => {
  vi.resetModules()
  delete (global as GlobalWithDb).db
})

describe('mock-db disk persistence', () => {
  it('persists a new workspace to disk', async () => {
    const { mockDb } = await import('@/lib/mock-db')
    const ws = mockDb.addWorkspace('Persisted WS')

    const file = path.join(tmp, 'app-data.json')
    expect(fs.existsSync(file)).toBe(true)
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(onDisk.workspaces.some((w: { id: string }) => w.id === ws.id)).toBe(true)
  })

  it('reloads persisted data in a fresh instance', async () => {
    const { mockDb } = await import('@/lib/mock-db')
    const conv = mockDb.addConversation('Persisted Conversation', null)

    vi.resetModules()
    delete (global as GlobalWithDb).db
    const { mockDb: reloaded } = await import('@/lib/mock-db')
    expect(reloaded.conversations.some((c) => c.id === conv.id)).toBe(true)
  })

  it('starts empty (no demo seed data)', async () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'aetherrag-empty-'))
    process.env.AETHERRAG_DATA_DIR = fresh
    vi.resetModules()
    delete (global as GlobalWithDb).db
    const { mockDb } = await import('@/lib/mock-db')
    expect(mockDb.documents).toHaveLength(0)
    expect(mockDb.analytics.totalDocuments).toBe(0)
    // restore for other tests
    process.env.AETHERRAG_DATA_DIR = tmp
  })
})
