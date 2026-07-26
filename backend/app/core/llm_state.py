"""Runtime-selectable LLM provider/model.

The generator reads its provider, model, base URL and API key from here on every
request, so changing the selection takes effect immediately — no restart. The
choice is persisted to a small JSON file in the data dir so it survives restarts.
Defaults come from env (`LLM_PROVIDER` + each provider's `*_MODEL`).
"""
import json
import os
import threading

from app.core.config import settings

# Provider registry: fixed endpoints + which config attrs hold the key/model.
PROVIDERS = {
    "mistral": {
        "label": "Mistral",
        "base_url_attr": "MISTRAL_BASE_URL",
        "key_attr": "MISTRAL_API_KEY",
        "model_attr": "MISTRAL_MODEL",
        "fallback_attr": "MISTRAL_FALLBACK_MODELS",
        "is_openrouter": False,
    },
    "openrouter": {
        "label": "OpenRouter",
        "base_url_attr": "OPENROUTER_BASE_URL",
        "key_attr": "OPENROUTER_API_KEY",
        "model_attr": "OPENROUTER_MODEL",
        "fallback_attr": "OPENROUTER_FALLBACK_MODELS",
        "is_openrouter": True,
    },
    "ollama": {
        "label": "Ollama",
        "base_url_attr": "OLLAMA_BASE_URL",
        "key_attr": None,
        "model_attr": "LLM_MODEL",
        "fallback_attr": None,
        "is_openrouter": False,
    },
    # User-supplied OpenAI-compatible endpoint. Unlike the others, its
    # base_url/key/model come from the persisted selection (set in Settings),
    # not from env — so any provider (OpenAI, Groq, Together, vLLM, ...) works.
    "custom": {
        "label": "Custom (OpenAI-compatible)",
        "base_url_attr": None,
        "key_attr": None,
        "model_attr": None,
        "fallback_attr": None,
        "is_openrouter": False,
    },
}

# Curated model menus for the hosted providers. Ollama's list is discovered live
# from its /api/tags (whatever the user has pulled locally).
CURATED_MODELS = {
    "mistral": [
        "mistral-small-latest",
        "mistral-medium-2508",
        "open-mistral-nemo",
        "mistral-tiny-latest",
    ],
    "openrouter": [
        "meta-llama/llama-3.3-70b-instruct:free",
        "openai/gpt-oss-20b:free",
        "google/gemma-4-26b-a4b-it:free",
        "openrouter/free",
    ],
}

_lock = threading.Lock()
_state = None  # {"provider": str, "model": str}


def _state_path() -> str:
    # Data dir is the parent of UPLOAD_DIR (<data>/uploads).
    data_dir = os.path.dirname(settings.UPLOAD_DIR.rstrip("/\\")) or "."
    return os.path.join(data_dir, "llm_selection.json")


def _load() -> dict:
    """Load selection (cached). Falls back to env defaults if no saved file."""
    global _state
    if _state is not None:
        return _state
    provider = settings.LLM_PROVIDER if settings.LLM_PROVIDER in PROVIDERS else "mistral"
    _state = {"provider": provider, "model": getattr(settings, PROVIDERS[provider]["model_attr"]), "custom": None}
    try:
        with open(_state_path(), "r", encoding="utf-8") as f:
            saved = json.load(f)
        if isinstance(saved.get("custom"), dict):
            _state["custom"] = saved["custom"]
        if saved.get("provider") in PROVIDERS and saved.get("model"):
            _state["provider"] = saved["provider"]
            _state["model"] = saved["model"]
    except (OSError, json.JSONDecodeError):
        pass  # ponytail: no file / bad file → keep env defaults
    return _state


def get() -> dict:
    with _lock:
        return dict(_load())


def _persist() -> None:
    try:
        with open(_state_path(), "w", encoding="utf-8") as f:
            json.dump(_state, f)
    except OSError:
        pass  # ponytail: persistence is best-effort; in-memory switch still works


def set_selection(provider: str, model: str) -> dict:
    """Switch the active provider+model and persist. Takes effect on next request."""
    global _state
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")
    if not model:
        raise ValueError("Model is required")
    with _lock:
        cur = dict(_load())  # keep any saved custom config
        cur["provider"] = provider
        cur["model"] = model
        _state = cur
        _persist()
        return {"provider": provider, "model": model}


def set_custom(base_url: str, api_key: str, model: str) -> dict:
    """Save a user-supplied OpenAI-compatible endpoint and switch to it."""
    global _state
    if not (base_url and api_key and model):
        raise ValueError("base_url, api_key and model are required")
    with _lock:
        cur = dict(_load())
        cur["custom"] = {"base_url": base_url.rstrip("/"), "api_key": api_key, "model": model}
        cur["provider"] = "custom"
        cur["model"] = model
        _state = cur
        _persist()
        return {"provider": "custom", "model": model}


def provider_has_key(provider: str) -> bool:
    if provider == "custom":
        c = get().get("custom") or {}
        return bool(c.get("base_url") and c.get("api_key"))
    attr = PROVIDERS[provider]["key_attr"]
    return True if attr is None else bool(getattr(settings, attr, "").strip())


def effective() -> dict:
    """Resolved config the generator uses: base_url, api_key, model chain, flags."""
    st = get()
    provider = st["provider"]
    if provider == "custom":
        c = st.get("custom") or {}
        model = c.get("model", "")
        return {
            "provider": "custom",
            "base_url": c.get("base_url", ""),
            "api_key": c.get("api_key", ""),
            "model": model,
            "chain": [model] if model else [],
            "is_openrouter": False,
        }
    prov = PROVIDERS[provider]
    api_key = getattr(settings, prov["key_attr"]) if prov["key_attr"] else ""
    chain = [st["model"]]
    if prov["fallback_attr"]:
        for m in getattr(settings, prov["fallback_attr"]).split(","):
            m = m.strip()
            if m and m not in chain:
                chain.append(m)
    return {
        "provider": provider,
        "base_url": getattr(settings, prov["base_url_attr"]),
        "api_key": api_key,
        "model": st["model"],
        "chain": chain,
        "is_openrouter": prov["is_openrouter"],
    }
