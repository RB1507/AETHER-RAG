"""User-facing LLM settings: read the current provider/model and switch them.

Switching mutates in-memory runtime state (see llm_state), so it takes effect on
the next query with no restart. Scoped behind auth like the rest of the app.
"""
import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core import llm_state
from app.core.config import settings
from app.models.user import User

logger = structlog.get_logger()
router = APIRouter(prefix="/api/settings", tags=["settings"])


class LLMSelection(BaseModel):
    provider: str
    model: str


class CustomLLM(BaseModel):
    base_url: str
    api_key: str
    model: str
    label: str | None = None


def _ollama_models() -> list[str]:
    """Locally-pulled Ollama models, or [] if Ollama isn't running."""
    try:
        # Short connect timeout so a down Ollama fails fast. `localhost` is
        # dual-stack (::1 + 127.0.0.1) and each attempt can hang for the full
        # connect timeout, so force IPv4 and keep the timeout tiny — this call
        # gates the whole model-list response the UI blocks on.
        base = settings.OLLAMA_BASE_URL.replace("localhost", "127.0.0.1")
        r = httpx.get(f"{base}/api/tags", timeout=httpx.Timeout(1.0, connect=0.3))
        if r.status_code == 200:
            return [m["name"] for m in r.json().get("models", []) if m.get("name")]
    except Exception:
        pass
    return []


@router.get("/llm")
def get_llm_settings(current_user: User = Depends(get_current_user)) -> dict:
    """Current selection + the available providers and their models."""
    current = llm_state.get()
    providers = []
    # Built-in providers.
    for pid, prov in llm_state.PROVIDERS.items():
        if pid == "ollama":
            models = _ollama_models()
            available = bool(models)
        else:
            models = llm_state.CURATED_MODELS.get(pid, [])
            available = llm_state.provider_has_key(pid)
        providers.append({
            "id": pid,
            "label": prov["label"],
            "models": models,
            "available": available,
            "hasKey": llm_state.provider_has_key(pid),
        })
    # Saved custom providers (each addressed as custom:<id>).
    for c in llm_state.list_custom():
        pid = f"custom:{c['id']}"
        has = llm_state.provider_has_key(pid)
        providers.append({
            "id": pid,
            "label": c["label"],
            "models": [c["model"]] if c["model"] else [],
            "available": has,
            "hasKey": has,
            "custom": True,
        })
    return {"provider": current["provider"], "model": current["model"], "providers": providers}


@router.post("/llm")
def set_llm_settings(
    selection: LLMSelection,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Switch the active provider+model. Effective immediately, no restart."""
    if not llm_state.is_valid_provider(selection.provider):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unknown provider: {selection.provider}")
    if selection.provider != "ollama" and not llm_state.provider_has_key(selection.provider):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"No API key configured for {selection.provider}.",
        )
    try:
        new = llm_state.set_selection(selection.provider, selection.model)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    logger.info("LLM selection changed", provider=new["provider"], model=new["model"])
    return new


@router.post("/llm/custom")
def set_custom_llm(
    cfg: CustomLLM,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Save a new user-supplied OpenAI-compatible provider (base URL + API key +
    model) and switch to it. Any number can be saved; each is addressed as
    custom:<id>. Effective immediately, no restart."""
    if not (cfg.base_url.strip() and cfg.api_key.strip() and cfg.model.strip()):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="base_url, api_key and model are all required",
        )
    new = llm_state.add_custom(
        cfg.base_url.strip(), cfg.api_key.strip(), cfg.model.strip(),
        (cfg.label or "").strip() or None,
    )
    logger.info("Custom LLM added", provider=new["provider"], model=new["model"])
    return new


@router.delete("/llm/custom/{cid}")
def delete_custom_llm(
    cid: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Delete a saved custom provider. If it was active, the selection falls
    back to the default provider."""
    try:
        result = llm_state.delete_custom(cid)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))
    logger.info("Custom LLM deleted", cid=cid, provider=result["provider"])
    return result
