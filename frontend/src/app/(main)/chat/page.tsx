'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { apiClient } from '@/lib/api-client'
import { Conversation, Message, RetrievedChunk, Citation } from '@/types'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'

// Subcomponents
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { GroundingDrawer } from '@/components/chat/GroundingDrawer'
import { GettingStarted } from '@/components/onboarding/GettingStarted'

export default function ChatPage() {
  const queryClient = useQueryClient()
  const { selectedWorkspaceId, streamingSpeed, workspaces } = useWorkspaceStore()
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)

  // Show the model actually in use — the runtime selection (chat-header
  // dropdown), which is the single source of truth. `/settings/llm` reflects
  // live switches, unlike the old /health-derived name.
  const { data: systemInfo } = useQuery({
    queryKey: ['llm-selection'],
    queryFn: () => apiClient.get<{ provider: string; model: string }>('/settings/llm'),
    staleTime: 30 * 1000,
  })
  const modelLabel = systemInfo?.model ?? null

  const [activeConvId, setActiveConvId] = React.useState<string | null>(null)
  const [inputText, setInputText] = React.useState('')
  const [isStreaming, setIsStreaming] = React.useState(false)

  // Streaming states
  const [streamText, setStreamText] = React.useState('')
  const [streamChunks, setStreamChunks] = React.useState<RetrievedChunk[]>([])
  const [streamCitations, setStreamCitations] = React.useState<Citation[]>([])

  // Grounding detail sidebar state
  const [selectedCitation, setSelectedCitation] = React.useState<Citation | null>(null)
  const [isGroundingOpen, setIsGroundingOpen] = React.useState(false)

  const activeWorkspace = React.useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null
  }, [workspaces, selectedWorkspaceId])

  // 1. Fetch conversations for active workspace
  const { data: conversations = [], isLoading: isLoadingConvs } = useQuery<Conversation[]>({
    queryKey: ['conversations', selectedWorkspaceId],
    queryFn: () =>
      apiClient.get<Conversation[]>(`/conversations?workspaceId=${selectedWorkspaceId}`),
    enabled: !!selectedWorkspaceId,
  })

  // Auto-select first conversation if exists and none active
  React.useEffect(() => {
    if (conversations.length > 0 && !activeConvId) {
      setActiveConvId(conversations[0].id)
    } else if (conversations.length === 0) {
      setActiveConvId(null)
    }
  }, [conversations, activeConvId])

  // 2. Fetch messages for active conversation
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ['messages', activeConvId],
    queryFn: () => apiClient.get<Message[]>(`/messages?conversationId=${activeConvId}`),
    enabled: !!activeConvId,
  })

  // 3. Create conversation mutation
  const createConvMutation = useMutation({
    mutationFn: (title: string) =>
      apiClient.post<Conversation>('/conversations', {
        title,
        workspaceId: selectedWorkspaceId,
      }),
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
      setActiveConvId(newConv.id)
    },
  })

  // 4. Delete conversation mutation
  const deleteConvMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/conversations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
      if (activeConvId) {
        setActiveConvId(null)
      }
      toast.success('Conversation deleted')
    },
  })

  // 5. Rename conversation mutation
  const renameConvMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiClient.put(`/conversations/${id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
    },
    onError: () => toast.error('Failed to rename conversation'),
  })

  // Scroll messages viewport to bottom
  const messageEndRef = React.useRef<HTMLDivElement>(null)
  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  React.useEffect(() => {
    scrollToBottom()
  }, [messages, streamText, isStreaming])

  // Auto-grow textarea height
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(160, textareaRef.current.scrollHeight)}px`
    }
  }, [inputText])

  const handleCreateNewChat = () => {
    if (!selectedWorkspaceId) return
    const chatNumber = conversations.length + 1
    createConvMutation.mutate(`Chat Room #${chatNumber}`)
  }

  // Handle SSE message submission
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim() || isStreaming || !selectedWorkspaceId) return

    let currentConvId = activeConvId
    // Auto-create a conversation if none exists
    if (!currentConvId) {
      try {
        const newConv = await createConvMutation.mutateAsync(`Chat Room #${conversations.length + 1}`)
        currentConvId = newConv.id
      } catch (err) {
        toast.error('Failed to start chat')
        return
      }
    }

    const queryText = inputText.trim()
    setInputText('')
    setIsStreaming(true)
    setStreamText('')
    setStreamChunks([])
    setStreamCitations([])

    //Optimistic UI addition
    queryClient.setQueryData<Message[]>(['messages', currentConvId], (prev = []) => [
      ...prev,
      {
        id: `optimistic_${Date.now()}`,
        conversationId: currentConvId!,
        role: 'user',
        content: queryText,
        citations: [],
        chunks: [],
        createdAt: new Date().toISOString(),
      },
    ])

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          conversationId: currentConvId,
          content: queryText,
          speed: streamingSpeed,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleanLine = line.trim()
          if (!cleanLine) continue

          if (cleanLine.startsWith('event: ')) {
            currentEvent = cleanLine.replace('event: ', '')
          } else if (cleanLine.startsWith('data: ')) {
            const dataStr = cleanLine.replace('data: ', '')
            try {
              const parsedData = JSON.parse(dataStr)
              if (currentEvent === 'token') {
                setStreamText((prev) => prev + parsedData.text)
              } else if (currentEvent === 'retrieval') {
                setStreamChunks(parsedData.chunks)
              } else if (currentEvent === 'citation') {
                setStreamCitations(parsedData.citations)
              }
            } catch (err) {
              // Ignore line-level JSON parses
            }
          }
        }
      }

      // Finish streaming and sync with DB
      queryClient.invalidateQueries({ queryKey: ['messages', currentConvId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', selectedWorkspaceId] })
    } catch (err) {
      toast.error('Failed to get response')
      // Remove user optimistic message on failure
      queryClient.invalidateQueries({ queryKey: ['messages', currentConvId] })
    } finally {
      setIsStreaming(false)
      setStreamText('')
      setStreamChunks([])
      setStreamCitations([])
    }
  }

  // Textarea key triggers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Handle citation bracket clicks e.g., [1]
  // Stable identities so the memoized MessageBubble doesn't re-render every
  // message on each streamed token.
  const handleCitationClick = React.useCallback((citationsList: Citation[], text: string) => {
    const match = text.match(/\[(\d+)\]/)
    if (match) {
      const idx = parseInt(match[1])
      const cit = citationsList.find((c) => c.index === idx)
      if (cit) {
        setSelectedCitation(cit)
        setIsGroundingOpen(true)
      }
    }
  }, [])

  const handleSourceClick = React.useCallback((citation: Citation) => {
    setSelectedCitation(citation)
    setIsGroundingOpen(true)
  }, [])

  if (!selectedWorkspaceId) {
    return (
      <div className="flex h-[calc(100vh-4rem)] md:h-screen items-center justify-center bg-surface-secondary dark:bg-background p-6">
        <GettingStarted />
      </div>
    )
  }

  const conversationTitle = conversations.find((c) => c.id === activeConvId)?.title || 'New Conversation'

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-screen w-full overflow-hidden relative">
      <ChatSidebar
        conversations={conversations}
        isLoadingConvs={isLoadingConvs}
        activeConvId={activeConvId}
        setActiveConvId={setActiveConvId}
        handleCreateNewChat={handleCreateNewChat}
        deleteConv={(id) => deleteConvMutation.mutate(id)}
        renameConv={(id, title) => renameConvMutation.mutate({ id, title })}
      />

      <ChatArea
        activeWorkspace={activeWorkspace}
        conversationTitle={conversationTitle}
        modelLabel={modelLabel}
        isLoadingMessages={isLoadingMessages}
        messages={messages}
        isStreaming={isStreaming}
        streamText={streamText}
        streamCitations={streamCitations}
        inputText={inputText}
        setInputText={setInputText}
        handleSendMessage={handleSendMessage}
        handleKeyDown={handleKeyDown}
        messageEndRef={messageEndRef}
        textareaRef={textareaRef}
        user={user}
        handleCitationClick={handleCitationClick}
        onSourceClick={handleSourceClick}
      />

      <GroundingDrawer
        isOpen={isGroundingOpen}
        setIsOpen={setIsGroundingOpen}
        selectedCitation={selectedCitation}
      />
    </div>
  )
}
