import threading
from contextlib import asynccontextmanager

import httpx
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.logging_config import configure_logging

# Configure logging at startup
configure_logging()

logger = structlog.get_logger()


def _warmup() -> None:
    """
    Preload heavy models so the first user query is fast:
    - embedding model (lazy-loaded singleton)
    - reranker model (only if enabled)
    - LLM in Ollama (load into memory via a tiny generate request)
    Runs in a background thread so it never blocks server startup.
    """
    from app.core.config import settings

    try:
        from app.rag.embedder import embed_texts
        embed_texts(["warmup"])
        logger.info("Embedding model warmed up")
    except Exception as e:
        logger.warning("Embedding model warmup failed", error=str(e))

    if settings.USE_RERANKER:
        try:
            from app.rag.reranker import _reranker
            _ = _reranker.model
            logger.info("Reranker model warmed up")
        except Exception as e:
            logger.warning("Reranker warmup failed", error=str(e))

    # Only the local Ollama model needs warming; hosted providers are always ready.
    if settings.LLM_PROVIDER == "ollama":
        try:
            httpx.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.LLM_MODEL,
                    "prompt": "ok",
                    "stream": False,
                    "keep_alive": settings.LLM_KEEP_ALIVE,
                    "options": {"num_predict": 1},
                },
                timeout=120.0,
            )
            logger.info("LLM warmed up in Ollama", model=settings.LLM_MODEL)
        except Exception as e:
            logger.warning("LLM warmup failed", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.config import settings
    if settings.WARMUP_ON_STARTUP:
        threading.Thread(target=_warmup, daemon=True).start()
    yield

from app.api.health import router as health_router
from app.api.documents import router as documents_router
from app.api.chat import router as chat_router
from app.api.auth import router as auth_router
from app.api.metrics import router as metrics_router
from app.api.settings import router as settings_router
from app.core.config import settings
from app.middleware.metrics import MetricsMiddleware

# Initialize Database tables
from app.db.database import Base, engine
from app.models.user import User
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS — restricted to the local frontend origins (a wildcard with
# credentials is both insecure and rejected by browsers).
_cors_origins = [o.strip() for o in settings.CORS_ALLOW_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    """Attach a baseline set of hardening response headers."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-XSS-Protection", "0")
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled errors: log with context and return a structured
    JSON 500 instead of leaking a stack trace to the client."""
    logger.error(
        "Unhandled server error",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        error_type=type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Add Telemetry Metrics Middleware
app.add_middleware(MetricsMiddleware)

# Register Routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(metrics_router)
app.include_router(settings_router)

