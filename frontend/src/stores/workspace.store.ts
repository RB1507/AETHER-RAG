import { create } from 'zustand'
import { Workspace } from '@/types'
import { apiClient } from '@/lib/api-client'

interface WorkspaceState {
  workspaces: Workspace[]
  selectedWorkspaceId: string | null
  streamingSpeed: 'slow' | 'normal' | 'fast'
  selectedModel: string
  isLoadingWorkspaces: boolean
  fetchWorkspaces: () => Promise<void>
  setSelectedWorkspaceId: (id: string | null) => void
  setStreamingSpeed: (speed: 'slow' | 'normal' | 'fast') => void
  setSelectedModel: (model: string) => void
  addWorkspace: (name: string, description?: string) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  selectedWorkspaceId: null,
  streamingSpeed: 'normal',
  // Cosmetic label only — the backend uses the server-side configured model
  // (OPENROUTER_MODEL in backend/.env). Keep this in sync so the UI doesn't lie.
  selectedModel: 'gpt-oss-20b',
  isLoadingWorkspaces: false,

  fetchWorkspaces: async () => {
    set({ isLoadingWorkspaces: true })
    try {
      const workspaces = await apiClient.get<Workspace[]>('/workspaces')
      set({ workspaces })

      // Auto-select the first workspace if none is selected, and DROP a stale
      // selection that isn't in the fetched list — e.g. after logging into a
      // different account, which cannot see the previous user's workspaces.
      const current = get().selectedWorkspaceId
      if (current && !workspaces.some((w) => w.id === current)) {
        set({ selectedWorkspaceId: workspaces[0]?.id ?? null })
      } else if (!current && workspaces.length > 0) {
        set({ selectedWorkspaceId: workspaces[0].id })
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err)
    } finally {
      set({ isLoadingWorkspaces: false })
    }
  },

  setSelectedWorkspaceId: (id) => {
    set({ selectedWorkspaceId: id })
  },

  setStreamingSpeed: (speed) => {
    set({ streamingSpeed: speed })
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model })
  },

  addWorkspace: async (name, description) => {
    const ws = await apiClient.post<Workspace>('/workspaces', { name, description })
    set((state) => {
      const updated = [...state.workspaces, ws]
      return {
        workspaces: updated,
        selectedWorkspaceId: state.selectedWorkspaceId || ws.id,
      }
    })
    return ws
  },

  deleteWorkspace: async (id) => {
    await apiClient.delete(`/workspaces/${id}`)
    set((state) => {
      const updated = state.workspaces.filter((w) => w.id !== id)
      let nextSelected = state.selectedWorkspaceId
      if (state.selectedWorkspaceId === id) {
        nextSelected = updated.length > 0 ? updated[0].id : null
      }
      return {
        workspaces: updated,
        selectedWorkspaceId: nextSelected,
      }
    })
  },
}))
