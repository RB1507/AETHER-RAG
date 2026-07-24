from app.core.config import settings
from app.rag.retriever import retrieve
from app.rag.reranker import rerank_chunks
from app.schemas.chat import ChatSource

def run_pipeline_stream(
    query: str,
    session_id: str,
    document_id: str | None = None,
    top_k: int = 5,
    owner: str | None = None,
    workspace_id: str | None = None,
):
    """
    Orchestrates the retrieval and reranking stages of the RAG pipeline,
    and returns the selected context chunks, conversation history, and formatted sources,
    ready to be streamed to the client. `owner`/`workspace_id` scope retrieval
    to the requesting user's own indexed content.
    """
    # 1. Retrieve candidates
    if settings.USE_RERANKER:
        candidate_pool = retrieve(query, top_k=max(top_k * 3, 10), document_id=document_id,
                                  owner=owner, workspace_id=workspace_id)
        # 2. Rerank candidates using Cross-Encoder
        reranked_chunks = rerank_chunks(query, candidate_pool)
        retrieved_chunks = reranked_chunks[:top_k]
    else:
        retrieved_chunks = retrieve(query, top_k=top_k, document_id=document_id,
                                    owner=owner, workspace_id=workspace_id)

    # 3. Retrieve history from memory service
    from app.services.memory_service import memory_service
    history = memory_service.get_history(session_id)

    # Format sources for metadata return
    sources = [
        ChatSource(
            chunk_id=chunk.chunk_id,
            source=chunk.metadata.source,
            page=chunk.metadata.page,
            score=chunk.score,
            text=(chunk.text[:300] + "…") if len(chunk.text) > 300 else chunk.text,
        )
        for chunk in retrieved_chunks
    ]

    return retrieved_chunks, history, sources
