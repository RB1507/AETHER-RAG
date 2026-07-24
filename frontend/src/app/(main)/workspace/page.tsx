'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { apiClient } from '@/lib/api-client'
import { Document } from '@/types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { DocumentList } from '@/components/retrieval/DocumentList'
import { GettingStarted } from '@/components/onboarding/GettingStarted'

export default function WorkspacePage() {
  const queryClient = useQueryClient()
  const { workspaces, selectedWorkspaceId, deleteWorkspace } = useWorkspaceStore()
  const [searchTerm, setSearchTerm] = React.useState('')

  const activeWorkspace = React.useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null
  }, [workspaces, selectedWorkspaceId])

  // Query to get documents for selected workspace
  const { data: documents = [], isLoading: isLoadingDocs } = useQuery<Document[]>({
    queryKey: ['documents', selectedWorkspaceId],
    queryFn: () => apiClient.get<Document[]>(`/documents?workspaceId=${selectedWorkspaceId}`),
    enabled: !!selectedWorkspaceId,
  })

  // Delete workspace mutation
  const deleteWsMutation = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: () => {
      toast.success('Workspace deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: () => {
      toast.error('Failed to delete workspace')
    },
  })

  // Delete document mutation
  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', selectedWorkspaceId] })
      useWorkspaceStore.getState().fetchWorkspaces()
      toast.success('Document deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete document')
    },
  })

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Workspace Header / Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {activeWorkspace ? activeWorkspace.name : 'Knowledge Grounding'}
          </h1>
          <p className="text-xs text-text-muted mt-1 leading-relaxed max-w-lg">
            {activeWorkspace?.description ||
              'Upload text files, documents, and specifications. Our agent chunks and vectorizes your documents for semantic search grounding.'}
          </p>
        </div>

        {activeWorkspace && (
          <Button
            variant="outline"
            size="sm"
            disabled={deleteWsMutation.isPending}
            onClick={() => {
              if (
                confirm(
                  `Are you sure you want to delete workspace "${activeWorkspace.name}"? This deletes all files and chats!`
                )
              ) {
                deleteWsMutation.mutate(activeWorkspace.id)
              }
            }}
            className="text-danger border-danger/30 hover:bg-danger/10 hover:text-danger rounded-xl h-9 self-start"
          >
            Delete Workspace
          </Button>
        )}
      </div>

      {!selectedWorkspaceId ? (
        <div className="flex justify-center py-8">
          <GettingStarted />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UploadDropzone selectedWorkspaceId={selectedWorkspaceId} />

          <DocumentList
            documents={documents}
            isLoadingDocs={isLoadingDocs}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            deleteDoc={(id) => deleteDocMutation.mutate(id)}
            isDeleting={deleteDocMutation.isPending}
          />
        </div>
      )}
    </div>
  )
}
