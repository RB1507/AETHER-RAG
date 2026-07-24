export const QUERY_KEYS = {
  AUTH: {
    USER: ['auth', 'user'] as const,
  },
  CONVERSATIONS: {
    LIST: ['conversations', 'list'] as const,
    DETAIL: (id: string) => ['conversations', 'detail', id] as const,
    MESSAGES: (id: string) => ['conversations', 'messages', id] as const,
  },
  DOCUMENTS: {
    LIST: (workspaceId: string | null) => ['documents', 'list', workspaceId] as const,
    STATUS: (jobId: string) => ['documents', 'status', jobId] as const,
  },
  WORKSPACES: {
    LIST: ['workspaces', 'list'] as const,
    DETAIL: (id: string) => ['workspaces', 'detail', id] as const,
  },
  ANALYTICS: {
    DATA: (range: string) => ['analytics', 'data', range] as const,
  },
} as const;
