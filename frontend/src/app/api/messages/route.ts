import { NextResponse } from 'next/server'
import { mockDb } from '@/lib/mock-db'
import { getUserIdFromRequest } from '@/lib/request-user'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

/** Shape of a source object as emitted by the backend `sources` SSE event. */
interface BackendSource {
  source?: string
  page?: number
  score?: number
  chunk_id?: string
  text?: string
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')

  if (!conversationId) {
    return NextResponse.json({ message: 'ConversationId is required' }, { status: 400 })
  }
  if (!mockDb.userOwnsConversation(conversationId, getUserIdFromRequest(request))) {
    return NextResponse.json([])
  }

  const messages = mockDb.messages.filter((m) => m.conversationId === conversationId)
  return NextResponse.json(messages)
}

export async function POST(request: Request) {
  try {
    const { conversationId, content, model, speed } = await request.json()

    if (!conversationId || !content) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Find the conversation and confirm it belongs to the requesting account.
    const conversation = mockDb.conversations.find((c) => c.id === conversationId)
    if (!conversation || !mockDb.userOwnsConversation(conversationId, getUserIdFromRequest(request))) {
      return NextResponse.json({ message: 'Conversation not found' }, { status: 404 })
    }

    // Try to get auth token from request headers
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    // ---- REAL BACKEND CALL ----
    // First, try the real backend. If it fails, fall back to mock.
    try {
      const backendResponse = await fetch(`${BACKEND_URL}/api/chat/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: content,
          session_id: conversationId,
          // 512-char chunks; 10 give the model ~5KB of source material so
          // "explain in detail" questions have enough to work with.
          top_k: 10,
          // Restrict retrieval to this conversation's workspace (the backend
          // additionally enforces the per-user scope from the token).
          workspace_id: conversation.workspaceId,
        }),
        signal: request.signal,
      })

      if (backendResponse.ok && backendResponse.body) {
        // Transform backend SSE format to frontend SSE format
        const reader = backendResponse.body.getReader()
        const decoder = new TextDecoder()

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            let accumulatedAnswer = ''
            let buffer = ''
            let finished = false
            const sources: BackendSource[] = []

            // Persist the turn and emit a single terminal `done` event. Guarded so
            // it runs exactly once — whether the backend sends an explicit `done`,
            // errors, or just closes the connection. Falls back to a friendly
            // message when the model produced nothing, so the UI never gets stuck
            // on an empty "thinking" bubble.
            const finalize = () => {
              if (finished) return
              finished = true
              const answer =
                accumulatedAnswer.trim() ||
                'No response was generated — the model may be busy or rate-limited. Please try again.'
              mockDb.addMessage('user', conversationId, content)
              mockDb.addMessage('assistant', conversationId, answer)
              controller.enqueue(
                encoder.encode(
                  `event: done\ndata: ${JSON.stringify({
                    messageId: `msg_${Math.random().toString(36).substr(2, 9)}`,
                    tokensUsed: answer.split(' ').length + 15,
                  })}\n\n`
                )
              )
            }

            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break

                // Buffer partial lines across read boundaries so an SSE event
                // split across two chunks isn't dropped (which previously could
                // lose the `done` event and leave the UI hanging).
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed || !trimmed.startsWith('data: ')) continue

                  try {
                    const data = JSON.parse(trimmed.replace('data: ', ''))

                    if (data.event === 'sources') {
                      // Backend sends sources as: { event: 'sources', sources: [...] }
                      // Transform to frontend format for retrieval chunks and citations
                      const chunks = (data.sources || []).map((s: BackendSource, i: number) => ({
                        id: s.chunk_id || `chk_${i}`,
                        documentId: s.chunk_id || `doc_${i}`,
                        documentName: s.source || 'Document',
                        content:
                          s.text ||
                          `Source: ${s.source}, Page ${s.page} (Score: ${s.score?.toFixed(2)})`,
                        score: s.score || 0,
                        pageNumber: s.page || 1,
                      }))

                      const citations = (data.sources || []).map((s: BackendSource, i: number) => ({
                        index: i + 1,
                        documentId: s.chunk_id || `doc_${i}`,
                        documentName: s.source || 'Document',
                        excerpt: s.text || `Source: ${s.source}, Page ${s.page}`,
                        pageNumber: s.page || 1,
                      }))

                      sources.push(...data.sources || [])

                      controller.enqueue(
                        encoder.encode(`event: retrieval\ndata: ${JSON.stringify({ chunks })}\n\n`)
                      )
                      controller.enqueue(
                        encoder.encode(`event: citation\ndata: ${JSON.stringify({ citations })}\n\n`)
                      )
                    } else if (data.event === 'token') {
                      // Backend sends: { event: 'token', token: '...' }
                      // Frontend expects: { text: '...' }
                      const tokenText = data.token || ''
                      accumulatedAnswer += tokenText
                      controller.enqueue(
                        encoder.encode(`event: token\ndata: ${JSON.stringify({ text: tokenText })}\n\n`)
                      )
                    } else if (data.event === 'done') {
                      // Save to mock DB for conversation history display
                      mockDb.addMessage('user', conversationId, content)
                      mockDb.addMessage('assistant', conversationId, accumulatedAnswer)

                      controller.enqueue(
                        encoder.encode(
                          `event: done\ndata: ${JSON.stringify({
                            messageId: `msg_${Math.random().toString(36).substr(2, 9)}`,
                            tokensUsed: accumulatedAnswer.split(' ').length + 15,
                          })}\n\n`
                        )
                      )
                    } else if (data.event === 'error') {
                      controller.enqueue(
                        encoder.encode(`event: token\ndata: ${JSON.stringify({ text: data.error || 'An error occurred.' })}\n\n`)
                      )
                      controller.enqueue(
                        encoder.encode(`event: done\ndata: ${JSON.stringify({ messageId: 'error', tokensUsed: 0 })}\n\n`)
                      )
                    }
                  } catch {
                    // Skip unparseable lines
                  }
                }
              }

              controller.close()
            } catch (error) {
              console.error('Stream transform error:', error)
              try {
                controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'Stream error' })}\n\n`))
                controller.close()
              } catch {
                // Ignore close errors
              }
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      }

      // If backend returned non-OK, log and fall through to mock
      console.warn(`Backend returned status ${backendResponse.status}, falling back to mock`)
    } catch (backendError) {
      console.warn('Backend not available, falling back to mock response:', backendError)
    }

    // ---- FALLBACK: MOCK RESPONSE ----
    const speedDelay = speed === 'fast' ? 10 : speed === 'slow' ? 80 : 30
    const answer = `The backend RAG service is not responding. Please ensure the backend is running on ${BACKEND_URL} and you have uploaded documents via the backend API. Your question was: "${content}"`

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`event: retrieval\ndata: ${JSON.stringify({ chunks: [] })}\n\n`)
          )
          await new Promise((r) => setTimeout(r, 200))

          controller.enqueue(
            encoder.encode(`event: citation\ndata: ${JSON.stringify({ citations: [] })}\n\n`)
          )
          await new Promise((r) => setTimeout(r, 200))

          const words = answer.split(' ')
          for (let i = 0; i < words.length; i++) {
            if (request.signal.aborted) return
            const word = words[i]
            const text = i === words.length - 1 ? word : word + ' '
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify({ text })}\n\n`)
            )
            await new Promise((r) => setTimeout(r, speedDelay))
          }

          mockDb.addMessage('user', conversationId, content)
          mockDb.addMessage('assistant', conversationId, answer)

          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({
                messageId: `msg_${Math.random().toString(36).substr(2, 9)}`,
                tokensUsed: words.length + 15,
              })}\n\n`
            )
          )
          controller.close()
        } catch (error) {
          console.error('Mock stream error:', error)
          try {
            controller.close()
          } catch {
            // Ignore
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err: unknown) {
    console.error('Error in message streaming API:', err)
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }
}
