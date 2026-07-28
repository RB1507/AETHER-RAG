import os
import errno
import glob
import shutil
import uuid
from datetime import datetime
from fastapi import UploadFile, HTTPException, status, BackgroundTasks
import structlog
from app.core.config import settings
from app.utils.file_utils import generate_secure_filename, validate_file_extension, validate_mime_type
from app.schemas.document import DocumentUploadResponse
from app.rag.extractor import extract_text_from_file
from app.rag.chunker import chunk_text
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks, allocate_chunk_indices
from app.rag.vector_store import delete_document as vector_delete_document
from app.rag.vector_store import get_document_metadata

logger = structlog.get_logger()

# In-memory store for tracking document status before DB configuration in Phase 13
DOCUMENT_STATUSES = {}


def _fail(document_id: str, message: str) -> None:
    """Mark a document failed and record a user-facing reason on its status."""
    rec = DOCUMENT_STATUSES.get(document_id)
    if rec is not None:
        rec["status"] = "failed"
        rec["error"] = message


def _reason_for(exc: Exception) -> str:
    """Turn a raw ingestion exception into a message a non-developer can act on."""
    if isinstance(exc, OSError) and exc.errno == errno.ENOSPC:
        return "Ran out of disk space while indexing this file. Free up space and try again."
    return "Something went wrong while indexing this file. Try a different file or re-upload it."

def process_document_task(
    document_id: str,
    file_path: str,
    original_filename: str,
    owner: str = "",
    workspace_id: str = "",
) -> None:
    """
    Background worker task to extract, chunk, embed, and load document text into the vector db.

    Declared as a plain ``def`` (not ``async``) on purpose: FastAPI runs sync
    background tasks in a worker thread, whereas an ``async`` task runs on the
    event loop. All the work here is blocking CPU (PDF/OCR extraction, embedding,
    LanceDB writes), so running it on the loop would freeze the whole server for
    the duration of indexing — including the upload status polls, making uploads
    feel far slower. Chunk-id allocation is lock-guarded, so concurrent uploads
    on the threadpool are safe.
    """
    try:
        # 1. Text extraction
        text, success = extract_text_from_file(file_path)
        if not success:
            logger.error("Failed to extract text from document in background task", document_id=document_id)
            _fail(document_id, "Could not read this file — it may be corrupted, password-protected, or empty.")
            return

        # 2. Chunking (record the on-disk path so the raw file can be deleted later,
        # plus owner/workspace so retrieval stays scoped to the uploading user)
        chunks = chunk_text(
            text, original_filename, document_id,
            file_path=file_path, owner=owner, workspace_id=workspace_id,
        )
        if not chunks:
            # No chunks = nothing to ground answers on (e.g. an image with no
            # readable text, or a near-empty doc). Surface it as a failure with a
            # reason rather than a silent "completed" that answers nothing.
            logger.warning("No chunks generated from document", document_id=document_id)
            _fail(document_id, "No readable text found — this looks like an empty document or an image with no text.")
            return

        # Assign globally-unique, continuing chunk ids. chunk_text numbers chunks
        # locally (0-based); we offset them by a reserved global range so a second
        # document never reuses ids and silently overwrites the first one.
        start_index = allocate_chunk_indices(len(chunks))
        for offset, chunk in enumerate(chunks):
            global_index = start_index + offset
            chunk.chunk_id = f"chunk_{global_index:06d}"
            chunk.metadata.chunk_index = global_index

        # 3. Embeddings
        chunk_texts = [c.text for c in chunks]
        embeddings = embed_texts(chunk_texts)

        # 4. Save to LanceDB
        add_chunks(chunks, embeddings)

        # Update status to completed
        DOCUMENT_STATUSES[document_id]["status"] = "completed"
        DOCUMENT_STATUSES[document_id]["chunk_count"] = len(chunks)
        logger.info("Document processed successfully in background", document_id=document_id, chunk_count=len(chunks))

    except Exception as e:
        logger.error("Unexpected error in background document processing", document_id=document_id, error=str(e))
        _fail(document_id, _reason_for(e))

async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    owner: str = "",
    workspace_id: str = "",
) -> DocumentUploadResponse:
    """
    Validates, saves the uploaded file, and registers a background processing task.
    Chunks are stamped with the uploader's identity + workspace for retrieval scoping.
    """
    filename = file.filename or ""
    content_type = file.content_type or ""

    # 1. Validate extension
    if not validate_file_extension(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type not allowed"
        )

    # 2. Validate MIME type
    if not validate_mime_type(content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type not allowed"
        )

    # 3. Validate file size (convert settings.MAX_FILE_SIZE_MB to bytes)
    file.file.seek(0, 2)
    size_bytes = file.file.tell()
    file.file.seek(0)

    max_size_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if size_bytes > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large"
        )

    # 4. Generate unique filename
    unique_filename = generate_secure_filename(filename)
    
    # Ensure directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    target_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    try:
        # Save file to disk
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file to disk: {str(e)}"
        )

    # Generate document ID
    document_id = f"doc_{uuid.uuid4().hex[:8]}"

    # Initialize status in memory
    DOCUMENT_STATUSES[document_id] = {
        "document_id": document_id,
        "filename": filename,
        "file_path": target_path,
        "status": "processing",
        "chunk_count": 0
    }

    # Add processing task to background queue
    background_tasks.add_task(
        process_document_task, document_id, target_path, filename, owner, workspace_id
    )

    return DocumentUploadResponse(
        document_id=document_id,
        filename=filename,
        status="processing",
        size_bytes=size_bytes,
        chunk_count=0,
        created_at=datetime.utcnow()
    )


def _resolve_file_path(document_id: str) -> str | None:
    """
    Best-effort resolution of a document's raw file on disk.

    Tries, in order: the in-memory registry, the path recorded on the document's
    chunks in LanceDB, and finally a glob match on the stored source filename.
    Returns None if the file cannot be located.
    """
    # 1. In-memory registry (present until the process restarts)
    info = DOCUMENT_STATUSES.get(document_id)
    if info and info.get("file_path") and os.path.exists(info["file_path"]):
        return info["file_path"]

    # 2. Path persisted on the chunks themselves (survives restarts)
    meta = get_document_metadata(document_id)
    if meta:
        path = meta.get("file_path")
        if path and os.path.exists(path):
            return path

        # 3. Fallback: match the unique "<uuid>_<original-name>" on disk. Chunks
        # indexed before file_path existed only carry the original "source" name.
        source = meta.get("source")
        if source:
            matches = glob.glob(os.path.join(settings.UPLOAD_DIR, f"*_{source}"))
            if len(matches) == 1:
                return matches[0]
            if len(matches) > 1:
                logger.warning(
                    "Ambiguous file match on delete; skipping raw-file removal",
                    document_id=document_id, source=source, match_count=len(matches)
                )

    return None


def delete_document(document_id: str) -> bool:
    """
    Permanently removes a document: deletes all of its chunks from the vector
    store AND removes the original uploaded file from disk. Idempotent — returns
    True if any chunks or a file were removed, False if nothing was found.
    """
    file_path = _resolve_file_path(document_id)

    # Remove vectorized chunks first so the document stops grounding answers.
    chunks_removed = vector_delete_document(document_id)

    file_removed = False
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            file_removed = True
        except OSError as e:
            logger.error("Failed to remove raw file on delete",
                         document_id=document_id, file_path=file_path, error=str(e))

    # Drop the in-memory record regardless.
    DOCUMENT_STATUSES.pop(document_id, None)

    logger.info("Deleted document", document_id=document_id,
                chunks_removed=chunks_removed, file_removed=file_removed)

    return chunks_removed > 0 or file_removed
