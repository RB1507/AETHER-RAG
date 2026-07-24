import os
import threading
import lancedb
import pyarrow as pa
import structlog
from app.core.config import settings
from app.schemas.document import ChunkSchema

logger = structlog.get_logger()

# Global, monotonically increasing chunk counter. Chunk ids must be unique across
# the whole table (chunk_id is the merge_insert primary key), so numbering
# continues from the highest index already stored instead of restarting at 0 for
# each document — otherwise a second upload's "chunk_000" would overwrite the
# first's. The lock keeps concurrent uploads (multi-file drops) from reserving the
# same range. Lazily seeded from the persisted table so it survives restarts.
_index_lock = threading.Lock()
_next_chunk_index: int | None = None

# Everything except the 384-dim vector. Selected on scans so the BM25 corpus pull
# and metadata reads don't drag every embedding into memory.
_META_COLUMNS = [
    "chunk_id", "text", "source", "page", "chunk_index",
    "document_id", "file_path", "owner", "workspace_id",
]

# Effectively-unbounded limit for full/filtered scans. LanceDB requires an
# explicit limit; the corpora this local app holds are small.
_SCAN_LIMIT = 10_000_000


def _invalidate_retrieval_cache() -> None:
    """Clear the retriever's cached BM25 index after the corpus changes.

    Imported lazily to avoid a circular import (retriever imports this module).
    """
    try:
        from app.rag.retriever import invalidate_retrieval_cache
        invalidate_retrieval_cache()
    except Exception:
        # Retriever may not be imported yet (e.g. during ingestion-only flows).
        pass


def _sql_str(value: str) -> str:
    """Escape a string for use as a single-quoted SQL literal in a Lance filter.

    Doubling embedded single quotes defeats filter injection: without it, a
    crafted owner/workspace value like ``a' OR '1'='1`` would broaden the scope
    and leak another user's chunks. See the retrieval-isolation test.
    """
    return str(value).replace("'", "''")


def build_where(
    document_id: str | None = None,
    owner: str | None = None,
    workspace_id: str | None = None,
) -> str | None:
    """Compose an escaped SQL predicate scoping retrieval to a user/workspace/document.

    Returns None when nothing is scoped (a full-corpus read).
    """
    conds: list[str] = []
    if document_id:
        conds.append(f"document_id = '{_sql_str(document_id)}'")
    if owner:
        conds.append(f"owner = '{_sql_str(owner)}'")
    if workspace_id:
        conds.append(f"workspace_id = '{_sql_str(workspace_id)}'")
    if not conds:
        return None
    return " AND ".join(conds)


def _row_metadata(row: dict) -> dict:
    """Pull the ChunkMetadata fields out of a raw Lance row (dropping the vector)."""
    return {
        "source": row.get("source", ""),
        "page": row.get("page", 0),
        "chunk_index": row.get("chunk_index", 0),
        "document_id": row.get("document_id", ""),
        "file_path": row.get("file_path", ""),
        "owner": row.get("owner", ""),
        "workspace_id": row.get("workspace_id", ""),
    }


class VectorStore:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(VectorStore, cls).__new__(cls)
            cls._instance._db = None
            cls._instance._table = None
        return cls._instance

    @property
    def _schema(self) -> pa.Schema:
        return pa.schema([
            pa.field("chunk_id", pa.string()),
            pa.field("text", pa.string()),
            pa.field("vector", pa.list_(pa.float32(), settings.EMBEDDING_DIMENSION)),
            pa.field("source", pa.string()),
            pa.field("page", pa.int64()),
            pa.field("chunk_index", pa.int64()),
            pa.field("document_id", pa.string()),
            pa.field("file_path", pa.string()),
            pa.field("owner", pa.string()),
            pa.field("workspace_id", pa.string()),
        ])

    @property
    def db(self) -> "lancedb.DBConnection":
        if self._db is None:
            os.makedirs(settings.LANCE_URI, exist_ok=True)
            self._db = lancedb.connect(settings.LANCE_URI)
        return self._db

    @property
    def table(self) -> "lancedb.table.Table":
        if self._table is None:
            name = settings.LANCE_TABLE_NAME
            try:
                self._table = self.db.open_table(name)
            except Exception:
                # Table doesn't exist yet — create it empty with our schema so
                # filtered reads work even before the first document is ingested.
                self._table = self.db.create_table(name, schema=self._schema)
        return self._table

    def add_chunks(self, chunks: list[ChunkSchema], embeddings: list[list[float]]) -> None:
        """Upsert document chunks and their embeddings into LanceDB (keyed by chunk_id)."""
        if not chunks:
            return

        rows = []
        for chunk, emb in zip(chunks, embeddings):
            meta = chunk.metadata
            rows.append({
                "chunk_id": chunk.chunk_id,
                "text": chunk.text,
                "vector": list(emb),
                "source": meta.source,
                "page": meta.page,
                "chunk_index": meta.chunk_index,
                "document_id": meta.document_id,
                "file_path": meta.file_path,
                "owner": meta.owner,
                "workspace_id": meta.workspace_id,
            })

        # merge_insert on the chunk_id primary key reproduces Chroma's upsert:
        # re-indexing an existing id updates it in place instead of duplicating.
        (self.table.merge_insert("chunk_id")
             .when_matched_update_all()
             .when_not_matched_insert_all()
             .execute(rows))
        _invalidate_retrieval_cache()

    def search(
        self,
        query_embedding: list[float],
        top_k: int,
        document_id: str | None = None,
        owner: str | None = None,
        workspace_id: str | None = None,
    ) -> list[dict]:
        """Return the closest `top_k` chunks by cosine distance, scoped by filter.

        LanceDB flat search handles an arbitrarily large `top_k` (the retriever
        asks for one neighbor per candidate), so no reduced-n retry is needed —
        unlike Chroma/hnswlib, which raised on large n_results.
        """
        where = build_where(document_id, owner, workspace_id)
        n = max(1, top_k)
        try:
            q = self.table.search(query_embedding).metric("cosine")
            if where:
                q = q.where(where, prefilter=True)
            results = q.limit(n).to_list()
        except Exception as e:
            logger.error("Vector search failed", error=str(e))
            return []

        matched_chunks = []
        for row in results:
            matched_chunks.append({
                "chunk_id": row["chunk_id"],
                "text": row["text"],
                "metadata": _row_metadata(row),
                # Lance cosine distance = 1 - cosine_similarity, matching Chroma's
                # cosine distance, so the retriever's `1 - distance` stays correct.
                "distance": row["_distance"],
            })
        return matched_chunks

    def scan(
        self,
        document_id: str | None = None,
        owner: str | None = None,
        workspace_id: str | None = None,
    ) -> tuple[list[str], list[str], list[dict]]:
        """Return (ids, documents, metadatas) for every chunk matching the filter.

        A vector-less filtered scan used to build the BM25 corpus. The embedding
        column is excluded via select() so the pull stays light.
        """
        where = build_where(document_id, owner, workspace_id)
        try:
            q = self.table.search().select(_META_COLUMNS)
            if where:
                q = q.where(where)
            rows = q.limit(_SCAN_LIMIT).to_list()
        except Exception as e:
            logger.error("Vector store scan failed", error=str(e))
            return [], [], []

        ids = [r["chunk_id"] for r in rows]
        documents = [r["text"] for r in rows]
        metadatas = [_row_metadata(r) for r in rows]
        return ids, documents, metadatas

    def delete_document(self, document_id: str) -> int:
        """Delete all chunks for a document_id. Returns how many were removed."""
        where = f"document_id = '{_sql_str(document_id)}'"
        try:
            existing = (self.table.search().select(["chunk_id"])
                        .where(where).limit(_SCAN_LIMIT).to_list())
            count = len(existing)
            if count:
                self.table.delete(where)
                _invalidate_retrieval_cache()
            return count
        except Exception as e:
            logger.error("delete_document failed", document_id=document_id, error=str(e))
            return 0

    def get_document_metadata(self, document_id: str) -> dict | None:
        """Return one chunk's stored metadata (source, file_path, ...) for a document.

        Used to locate the raw file on disk when the in-memory document registry
        has been cleared (e.g. after a restart).
        """
        where = f"document_id = '{_sql_str(document_id)}'"
        try:
            rows = (self.table.search().select(_META_COLUMNS)
                    .where(where).limit(1).to_list())
        except Exception:
            return None
        if rows:
            return _row_metadata(rows[0])
        return None

    def collection_stats(self) -> dict:
        """Return stats such as total chunk count."""
        try:
            return {"chunk_count": self.table.count_rows()}
        except Exception:
            return {"chunk_count": 0}

    def _max_chunk_index(self) -> int:
        """Highest chunk_index currently stored, or -1 if the table is empty."""
        try:
            rows = (self.table.search().select(["chunk_index"])
                    .limit(_SCAN_LIMIT).to_list())
        except Exception:
            return -1
        highest = -1
        for r in rows:
            ci = r.get("chunk_index")
            if isinstance(ci, int) and ci > highest:
                highest = ci
        return highest

    def allocate_chunk_indices(self, count: int) -> int:
        """Atomically reserve `count` consecutive global chunk indices, return the first.

        Guarantees unique, ever-increasing chunk ids even when several documents
        are uploaded concurrently.
        """
        global _next_chunk_index
        if count <= 0:
            return 0
        with _index_lock:
            if _next_chunk_index is None:
                _next_chunk_index = self._max_chunk_index() + 1
            start = _next_chunk_index
            _next_chunk_index += count
            return start


# Singleton instance
_vector_store = VectorStore()


def add_chunks(chunks: list[ChunkSchema], embeddings: list[list[float]]) -> None:
    _vector_store.add_chunks(chunks, embeddings)


def search(
    query_embedding: list[float],
    top_k: int,
    document_id: str | None = None,
    owner: str | None = None,
    workspace_id: str | None = None,
) -> list[dict]:
    return _vector_store.search(query_embedding, top_k, document_id, owner, workspace_id)


def scan(
    document_id: str | None = None,
    owner: str | None = None,
    workspace_id: str | None = None,
) -> tuple[list[str], list[str], list[dict]]:
    return _vector_store.scan(document_id, owner, workspace_id)


def delete_document(document_id: str) -> int:
    return _vector_store.delete_document(document_id)


def get_document_metadata(document_id: str) -> dict | None:
    return _vector_store.get_document_metadata(document_id)


def collection_stats() -> dict:
    return _vector_store.collection_stats()


def allocate_chunk_indices(count: int) -> int:
    return _vector_store.allocate_chunk_indices(count)
