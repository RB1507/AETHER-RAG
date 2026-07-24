from fastapi import APIRouter, File, Form, UploadFile, BackgroundTasks, HTTPException, Depends
from app.schemas.document import DocumentUploadResponse, DocumentStatusResponse, DocumentURLIngestRequest
from app.services.document_service import upload_document, delete_document, DOCUMENT_STATUSES
from app.services.url_ingest_service import ingest_url
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    workspaceId: str | None = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user)
) -> DocumentUploadResponse:
    """
    Endpoint to upload a file (PDF, TXT, DOCX).
    Enforces format constraints and size limits, then starts background processing.
    Chunks are stamped with the uploader + workspace so retrieval is scoped per user.
    """
    return await upload_document(
        file, background_tasks,
        owner=current_user.email, workspace_id=workspaceId or "",
    )

@router.post("/ingest-url", response_model=DocumentUploadResponse)
async def ingest_url_endpoint(
    payload: DocumentURLIngestRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user)
) -> DocumentUploadResponse:
    """
    Indexes content from a URL: YouTube videos (transcript), PDFs (downloaded),
    or any web page such as an online book/article (readable text extracted).
    Processing runs in the background; poll /{document_id}/status like uploads.
    """
    return ingest_url(
        payload.url, background_tasks,
        owner=current_user.email, workspace_id=payload.workspaceId or "",
    )

@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str,
    current_user: User = Depends(get_current_user)
) -> DocumentStatusResponse:
    """
    Checks the status of a background document processing task.
    """
    status_info = DOCUMENT_STATUSES.get(document_id)
    if not status_info:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentStatusResponse(
        document_id=status_info["document_id"],
        filename=status_info["filename"],
        status=status_info["status"],
        chunk_count=status_info["chunk_count"]
    )

@router.delete("/{document_id}")
async def delete_document_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user)
) -> dict:
    """
    Permanently deletes a document: removes its vectorized chunks from the store
    and its original file from disk. No copies are left behind.
    """
    deleted = delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "document_id": document_id}
