from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.core.config import settings
from app.schemas.document import ChunkSchema, ChunkMetadata

def chunk_text(
    text: str,
    source_name: str,
    document_id: str,
    file_path: str = "",
    owner: str = "",
    workspace_id: str = "",
) -> list[ChunkSchema]:
    """
    Splits clean extracted text into overlapping chunks using RecursiveCharacterTextSplitter.
    Tracks metadata (source, page, chunk_index, document_id, file_path, and the
    owner/workspace used for retrieval scoping) for each chunk.
    Filters out chunks smaller than MIN_CHUNK_LENGTH.
    """
    # Split by custom PAGE_BREAK to preserve page boundary metadata
    pages = text.split("---PAGE_BREAK---")
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP
    )
    
    chunks = []
    chunk_index = 0
    
    for page_idx, page_content in enumerate(pages):
        page_num = page_idx + 1
        page_content = page_content.strip()
        if not page_content:
            continue
        
        # Split page content into overlapping sub-chunks
        sub_chunks = text_splitter.split_text(page_content)
        
        for sub_chunk in sub_chunks:
            sub_chunk = sub_chunk.strip()
            # Ignore empty or overly short chunks
            if len(sub_chunk) < settings.MIN_CHUNK_LENGTH:
                continue
            
            chunk_id = f"chunk_{chunk_index:03d}"
            
            chunks.append(ChunkSchema(
                chunk_id=chunk_id,
                text=sub_chunk,
                metadata=ChunkMetadata(
                    source=source_name,
                    page=page_num,
                    chunk_index=chunk_index,
                    document_id=document_id,
                    file_path=file_path,
                    owner=owner,
                    workspace_id=workspace_id,
                )
            ))
            chunk_index += 1
            
    return chunks
