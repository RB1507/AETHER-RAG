import os
import structlog
from fastembed import TextEmbedding
from app.core.config import settings

logger = structlog.get_logger()

# Quiet the Windows symlink caching warning from huggingface_hub.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


class Embedder:
    """
    ONNX-based text embedder (fastembed). Replaces the previous
    sentence-transformers/torch implementation to keep the dependency
    footprint small enough to package into a desktop installer.
    """

    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(Embedder, cls).__new__(cls, *args, **kwargs)
            cls._instance._model = None
        return cls._instance

    @property
    def model(self) -> TextEmbedding:
        if self._model is None:
            logger.info("Loading embedding model (ONNX/fastembed)", model=settings.EMBEDDING_MODEL)
            self._model = TextEmbedding(
                model_name=settings.EMBEDDING_MODEL,
                cache_dir=settings.EMBEDDING_CACHE_DIR or None,
            )
            logger.info("Embedding model loaded successfully")
        return self._model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return [
            vec.tolist()
            for vec in self.model.embed(texts, batch_size=settings.EMBEDDING_BATCH_SIZE)
        ]


# Singleton instance
_embedder = Embedder()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Converts a list of strings into 384-dimensional embeddings using the
    ONNX BAAI/bge-small-en-v1.5 model via fastembed.
    """
    return _embedder.embed_texts(texts)
