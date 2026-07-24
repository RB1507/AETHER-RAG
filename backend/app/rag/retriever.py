import threading
import structlog
from rank_bm25 import BM25Okapi
from app.core.config import settings
from app.rag.embedder import embed_texts
from app.rag.vector_store import search, _vector_store
from app.schemas.document import RetrievedChunk, ChunkMetadata

logger = structlog.get_logger()

# Cache for the corpus pull + BM25 index. Building BM25 over the whole corpus on
# every query is wasteful since the index only changes when documents are
# ingested or deleted. Cached payload: (ids, documents, metadatas, bm25).
# Invalidated via invalidate_retrieval_cache() from the vector store on mutation.
_corpus_cache: dict = {}
_corpus_cache_lock = threading.Lock()


def invalidate_retrieval_cache() -> None:
    """Drop the cached corpus/BM25 index. Called when the vector store changes."""
    with _corpus_cache_lock:
        _corpus_cache.clear()


def _get_corpus_and_bm25(
    cache_key: tuple,
    document_id: str | None,
    owner: str | None,
    workspace_id: str | None,
):
    """
    Returns (ids, documents, metadatas, bm25) for the given filter, building and
    caching the BM25 index lazily. The cache is keyed by the full filter tuple
    (document, owner, workspace) and is cleared whenever documents are added or
    removed. The candidate set is pulled via the vector store's escaped-filter
    scan, so isolation is enforced in one place.
    """
    with _corpus_cache_lock:
        cached = _corpus_cache.get(cache_key)
        if cached is not None:
            return cached

    ids, documents, metadatas = _vector_store.scan(document_id, owner, workspace_id)

    bm25 = None
    if ids:
        tokenized_corpus = [doc.lower().split() for doc in documents]
        bm25 = BM25Okapi(tokenized_corpus)

    payload = (ids, documents, metadatas, bm25)
    with _corpus_cache_lock:
        _corpus_cache[cache_key] = payload
    return payload


def retrieve(
    query: str,
    top_k: int,
    document_id: str | None = None,
    owner: str | None = None,
    workspace_id: str | None = None,
) -> list[RetrievedChunk]:
    """
    End-to-end hybrid retrieval: combines dense vector search and sparse BM25 lexical search.
    Computes a weighted combined score:
        Score = alpha * semantic_score + (1 - alpha) * lexical_score
    Filters out matches below a 0.5 combined similarity threshold.

    `owner`/`workspace_id` scope the candidate pool so a user's query can only
    ever match chunks they ingested (and, when given, only from one workspace).
    """
    if not query or not query.strip():
        return []

    # 1. Retrieve all candidate chunks matching the scoping filter from the store
    cache_key = (document_id, owner, workspace_id)

    try:
        ids, documents, metadatas, bm25 = _get_corpus_and_bm25(
            cache_key, document_id, owner, workspace_id
        )
    except Exception as e:
        logger.error("Failed to retrieve candidate documents from vector store", error=str(e))
        return []

    if not ids:
        logger.info("No candidates found in vector store for hybrid search", filters=cache_key)
        return []

    # 2. Sparse Lexical Search (BM25) using the cached corpus index
    tokenized_query = query.lower().split()
    bm25_scores = bm25.get_scores(tokenized_query)

    max_bm25_score = max(bm25_scores) if len(bm25_scores) > 0 else 0.0
    normalized_bm25_scores = [
        (score / max_bm25_score) if max_bm25_score > 0 else 0.0
        for score in bm25_scores
    ]

    # 3. Dense Semantic Search (Vector)
    query_embeddings = embed_texts([query])
    if not query_embeddings:
        return []
    query_emb = query_embeddings[0]

    semantic_results = search(
        query_embedding=query_emb, top_k=len(ids),
        document_id=document_id, owner=owner, workspace_id=workspace_id,
    )
    
    # Map chunk_id to its semantic similarity score (1.0 - distance)
    semantic_scores = {}
    for item in semantic_results:
        distance = item["distance"]
        semantic_scores[item["chunk_id"]] = 1.0 - distance

    # 4. Combine Scores
    hybrid_results = []
    alpha = settings.HYBRID_ALPHA

    for idx, chunk_id in enumerate(ids):
        text = documents[idx]
        metadata = metadatas[idx]

        sem_score = semantic_scores.get(chunk_id, 0.0)
        lex_score = normalized_bm25_scores[idx]

        # Combine using HYBRID_ALPHA
        combined_score = alpha * sem_score + (1.0 - alpha) * lex_score

        # Use maximum of sem_score and combined_score to avoid penalizing strong semantic matches
        final_score = max(sem_score, combined_score)

        # Apply threshold of 0.5
        if final_score < 0.5:
            continue

        hybrid_results.append(RetrievedChunk(
            chunk_id=chunk_id,
            text=text,
            metadata=ChunkMetadata(
                source=metadata["source"],
                page=metadata["page"],
                chunk_index=metadata["chunk_index"],
                document_id=metadata["document_id"]
            ),
            score=round(float(final_score), 4)
        ))

    # 5. Sort by combined score descending and limit to top_k
    hybrid_results.sort(key=lambda x: x.score, reverse=True)
    return hybrid_results[:top_k]
