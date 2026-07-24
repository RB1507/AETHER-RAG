import os
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_file_path() -> str:
    """Locate the .env file in both source and PyInstaller-frozen runs.

    In a normal run the .env sits at the backend root (3 dirs up from this
    file). When frozen, ``__file__`` lives inside the temporary _MEIPASS
    extraction dir, so we look for a .env next to the executable instead
    (the desktop launcher writes one there). Env vars always take precedence,
    so a missing file is harmless when config is injected by the launcher.
    """
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), ".env")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        ".env",
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file_path(),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # App Settings
    APP_NAME: str = "AETHER RAG"
    APP_ENV: str = "development"
    APP_PORT: int = 8000
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    # Refresh tokens are long-lived; the client silently exchanges them for new
    # access tokens so sessions don't drop mid-use.
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # CORS: comma-separated allowed origins. The desktop app only ever calls the
    # backend from the local Next.js server, so we restrict to localhost rather
    # than using a wildcard (which is invalid together with credentials).
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Database & Redis Settings
    DATABASE_URL: str
    REDIS_URL: str

    # Vector Database Settings (LanceDB — disk-first / memory-mapped)
    LANCE_URI: str = "./vector_store"
    LANCE_TABLE_NAME: str = "aether_rag"

    # Embedding Settings (ONNX via fastembed)
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_DIMENSION: int = 384
    # Where fastembed caches the ONNX model (bundle-able for packaging).
    EMBEDDING_CACHE_DIR: str = "./model_cache"

    # LLM Settings
    # Which backend to generate with: "ollama" (local) or "openrouter" (hosted, free models).
    LLM_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen3.5:4b"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 256
    # Discourages token loops ("de de de...") that small/free models fall into
    # at low temperature. Sent as repetition_penalty (OpenRouter) and
    # repeat_penalty (Ollama). 1.0 disables; keep modest (1.05-1.2) so normal
    # prose isn't distorted.
    LLM_REPETITION_PENALTY: float = 1.1
    # Qwen3 and other "thinking" models emit reasoning into a separate `thinking`
    # field and leave `response` empty until done, consuming the whole token
    # budget. Disable it so the model returns a direct answer immediately.
    LLM_THINK: bool = False
    # Keep the model resident in Ollama between requests to avoid cold reloads.
    # Accepts a duration string ("30m", "1h") or "-1" to keep loaded indefinitely.
    LLM_KEEP_ALIVE: str = "30m"
    # Warm up models (embedder + LLM) on startup so the first query isn't slow.
    WARMUP_ON_STARTUP: bool = True

    # Mistral (hosted, OpenAI-compatible). Used when LLM_PROVIDER="mistral".
    MISTRAL_API_KEY: str = ""
    MISTRAL_BASE_URL: str = "https://api.mistral.ai/v1"
    MISTRAL_MODEL: str = "mistral-small-latest"
    MISTRAL_FALLBACK_MODELS: str = "open-mistral-nemo"

    # OpenRouter (hosted) settings. Used when LLM_PROVIDER="openrouter".
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"
    # Free OpenRouter models get rate-limited (429) frequently. If the primary
    # model is unavailable, the generator falls back to these in order. Use
    # non-reasoning instruct models (reasoning models return empty content).
    # "openrouter/free" auto-routes to any currently-available free model, so it
    # acts as a last-resort catch-all when every named model is rate-limited.
    OPENROUTER_FALLBACK_MODELS: str = (
        "google/gemma-4-26b-a4b-it:free,openai/gpt-oss-20b:free,"
        "meta-llama/llama-3.3-70b-instruct:free,openrouter/free"
    )
    # Slow-model switching: free models sometimes accept the request but then
    # sit in a queue for minutes. Rather than waiting, give up on a model that
    # hasn't produced anything within these windows and try the next one.
    # Streaming: max seconds to wait for the FIRST token from a model.
    OPENROUTER_FIRST_TOKEN_TIMEOUT_S: float = 20.0
    # Streaming: max seconds a started stream may stall between tokens before
    # we end the answer with what we have.
    OPENROUTER_STALL_TIMEOUT_S: float = 30.0
    # Non-streaming: max seconds for a model's whole response.
    OPENROUTER_MODEL_TIMEOUT_S: float = 45.0

    # Chunking Settings
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    MIN_CHUNK_LENGTH: int = 50

    # Retrieval Settings
    TOP_K: int = 3
    HYBRID_ALPHA: float = 0.5
    USE_RERANKER: bool = False
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # File Ingestion Settings
    MAX_FILE_SIZE_MB: int = 20
    # Images are OCR'd (RapidOCR); scanned PDFs fall back to OCR automatically.
    ALLOWED_EXTENSIONS: str = "pdf,txt,docx,png,jpg,jpeg,tiff,tif,bmp"
    UPLOAD_DIR: str = "./uploads"

    # Logging Settings
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "./logs"

settings = Settings()
