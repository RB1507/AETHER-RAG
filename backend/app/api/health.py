from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check() -> dict[str, str]:
    # The model that generation actually uses depends on the active provider, so
    # report that one (not just whichever field happens to be set).
    active_model = (
        settings.OPENROUTER_MODEL
        if settings.LLM_PROVIDER == "openrouter"
        else settings.LLM_MODEL
    )
    return {
        "status": "ok",
        "version": "1.0.0",
        "env": settings.APP_ENV,
        "provider": settings.LLM_PROVIDER,
        "model": active_model,
    }
