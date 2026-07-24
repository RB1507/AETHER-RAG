import time
import structlog
from app.core.config import settings
from app.schemas.document import RetrievedChunk

logger = structlog.get_logger()

class Reranker:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(Reranker, cls).__new__(cls, *args, **kwargs)
            cls._instance._model = None
        return cls._instance

    @property
    def model(self):
        if self._model is None:
            logger.info("Loading reranker model", model=settings.RERANKER_MODEL)
            # Imported lazily: the cross-encoder needs sentence-transformers/torch,
            # which the lightweight (packaged) install omits. Only required when
            # USE_RERANKER is enabled.
            from sentence_transformers import CrossEncoder
            attempts = 3
            delay = 1.0
            for attempt in range(1, attempts + 1):
                try:
                    self._model = CrossEncoder(settings.RERANKER_MODEL)
                    logger.info("Reranker model loaded successfully")
                    break
                except Exception as e:
                    logger.error("Failed to load reranker model", attempt=attempt, error=str(e))
                    if attempt == attempts:
                        raise e
                    time.sleep(delay)
                    delay *= 2.0
        return self._model

    def rerank(self, query: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        if not chunks:
            return []

        pairs = [[query, chunk.text] for chunk in chunks]
        
        try:
            scores = self.model.predict(pairs)
        except Exception as e:
            logger.error("Reranking failed", error=str(e))
            # Fallback to original score ordering on failure
            return chunks

        # Update scores in-place
        for idx, score in enumerate(scores):
            chunks[idx].score = round(float(score), 4)

        # Sort descending by cross-encoder score
        chunks.sort(key=lambda x: x.score, reverse=True)
        return chunks

_reranker = Reranker()

def rerank_chunks(query: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    return _reranker.rerank(query, chunks)
