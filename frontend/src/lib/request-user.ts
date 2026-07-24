/**
 * Extracts the user id (the JWT `sub` claim — the user's email) from a
 * request's Authorization header.
 *
 * The payload is decoded WITHOUT signature verification: this identity is only
 * used to scope the local app-metadata store (workspaces/conversations) so
 * different accounts on this machine don't see each other's items. The real
 * data plane (documents, RAG queries) always goes to the FastAPI backend,
 * which fully verifies the same token's signature on every request.
 */
export function getUserIdFromRequest(request: Request): string | null {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}
