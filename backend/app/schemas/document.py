from datetime import datetime
from pydantic import BaseModel, ConfigDict

class DocumentURLIngestRequest(BaseModel):
    """A web/YouTube/book URL to fetch and index as a grounding document."""
    url: str
    workspaceId: str | None = None

class DocumentUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: str
    filename: str
    status: str
    size_bytes: int
    chunk_count: int = 0
    created_at: datetime

class ChunkMetadata(BaseModel):
    source: str
    page: int
    chunk_index: int
    document_id: str
    # Absolute/relative path of the original uploaded file on disk. Stored on each
    # chunk so the raw file can be located and removed on deletion even after a
    # restart wipes the in-memory document registry. Optional for backwards
    # compatibility with chunks indexed before this field existed.
    file_path: str = ""
    # Retrieval scoping: the uploader's identity (JWT sub / email) and the
    # workspace the document belongs to. Retrieval filters on these so one
    # user's queries can never surface another user's chunks. Empty on chunks
    # indexed before scoping existed (they match no owner filter until
    # migrated).
    owner: str = ""
    workspace_id: str = ""

class ChunkSchema(BaseModel):
    chunk_id: str
    text: str
    metadata: ChunkMetadata

class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    metadata: ChunkMetadata
    score: float

class DocumentStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: str
    filename: str
    status: str
    chunk_count: int
    # Human-readable reason when status == "failed"; None otherwise.
    error: str | None = None



