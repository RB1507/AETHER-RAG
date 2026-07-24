from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    query: str
    session_id: str
    top_k: int = Field(default=5, ge=1, le=20)
    document_id: str | None = None
    # Optional workspace filter — restricts retrieval to one workspace's
    # documents. The user filter is always applied server-side from the token.
    workspace_id: str | None = None

class ChatSource(BaseModel):
    chunk_id: str
    source: str
    page: int
    score: float
    # The actual retrieved passage, so the UI can show a real citation excerpt
    # rather than a synthetic "Source X, Page Y" string.
    text: str = ""

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatHistoryResponse(BaseModel):
    session_id: str
    history: list[ChatMessage]
