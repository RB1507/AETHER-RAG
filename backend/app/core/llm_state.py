"""Runtime-selectable LLM provider/model.

The generator reads its provider, model, base URL and API key from here on every
request, so changing the selection takes effect immediately — no restart. The
choice is persisted to a small JSON file in the data dir so it survives restarts.
Defaults come from env (`LLM_PROVIDER` + each provider's `*_MODEL`).

Besides the built-in providers, users can save any number of custom
OpenAI-compatible providers (their own Gemini/Claude/OpenAI/... keys). Each gets
an id and is selected as ``custom:<id>``.
"""
import json
import os
import threading
import uuid

from app.core.config import settings

# Built-in provider registry: fixed endpoints + which config attrs hold the
# key/model. Custom providers are NOT here — they live in the persisted state
# keyed by id and are addressed as "custom:<id>".
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
_state = None  # {"provider": str, "model": str, "custom": {id: {...}}}


def _is_custom(provider) -> bool:
    return isinstance(provider, str) and provider.startswith("custom:")


def _custom_id(provider: str):
    return provider.split(":", 1)[1] if _is_custom(provider) else None


def _state_path() -> str:
    # Data dir is the parent of UPLOAD_DIR (<data>/uploads).
    data_dir = os.path.dirname(settings.UPLOAD_DIR.rstrip("/\\")) or "."
    return os.path.join(data_dir, "llm_selection.json")


def _default_selection() -> dict:
    provider = settings.LLM_PROVIDER if settings.LLM_PROVIDER in PROVIDERS else "mistral"
    return {"provider": provider, "model": getattr(settings, PROVIDERS[provider]["model_attr"]), "custom": {}}


def _load() -> dict:
    """Load selection (cached). Falls back to env defaults if no saved file.
    Migrates the legacy single-custom shape to the keyed collection."""
    global _state
    if _state is not None:
        return _state
    _state = _default_selection()
    try:
        with open(_state_path(), "r", encoding="utf-8") as f:
            saved = json.load(f)
        custom = saved.get("custom")
        provider = saved.get("provider")
        model = saved.get("model")

        if isinstance(custom, dict) and "base_url" in custom:
            # Legacy: a single custom provider stored flat. Migrate to id-keyed.
            cid = uuid.uuid4().hex[:8]
            _state["custom"] = {
                cid: {
                    "label": custom.get("label") or "Custom",
                    "base_url": custom.get("base_url", ""),
                    "api_key": custom.get("api_key", ""),
                    "model": custom.get("model", ""),
                }
            }
            if provider == "custom":
                provider = f"custom:{cid}"
        elif isinstance(custom, dict):
            _state["custom"] = custom

        valid = (provider in PROVIDERS) or (
            _is_custom(provider) and _custom_id(provider) in _state["custom"]
        )
        if provider and valid and model:
            _state["provider"] = provider
            _state["model"] = model
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


def is_valid_provider(provider: str) -> bool:
    if _is_custom(provider):
        return _custom_id(provider) in (get().get("custom") or {})
    return provider in PROVIDERS


def set_selection(provider: str, model: str) -> dict:
    """Switch the active provider+model and persist. Takes effect on next request."""
    global _state
    if not model:
        raise ValueError("Model is required")
    with _lock:
        cur = dict(_load())
        if _is_custom(provider):
            if _custom_id(provider) not in (cur.get("custom") or {}):
                raise ValueError(f"Unknown provider: {provider}")
        elif provider not in PROVIDERS:
            raise ValueError(f"Unknown provider: {provider}")
        cur["provider"] = provider
        cur["model"] = model
        _state = cur
        _persist()
        return {"provider": provider, "model": model}


def add_custom(base_url: str, api_key: str, model: str, label: str | None = None) -> dict:
    """Save a new user-supplied OpenAI-compatible provider and switch to it.
    Returns {provider: 'custom:<id>', model}."""
    if not (base_url and api_key and model):
        raise ValueError("base_url, api_key and model are required")
    global _state
    with _lock:
        cur = dict(_load())
        customs = dict(cur.get("custom") or {})
        cid = uuid.uuid4().hex[:8]
        customs[cid] = {
            "label": (label or "Custom").strip() or "Custom",
            "base_url": base_url.rstrip("/"),
            "api_key": api_key,
            "model": model,
        }
        cur["custom"] = customs
        cur["provider"] = f"custom:{cid}"
        cur["model"] = model
        _state = cur
        _persist()
        return {"provider": cur["provider"], "model": model}


def delete_custom(cid: str) -> dict:
    """Remove a saved custom provider. If it was active, fall back to the env
    default provider. Returns the resulting active {provider, model}."""
    global _state
    with _lock:
        cur = dict(_load())
        customs = dict(cur.get("custom") or {})
        if cid not in customs:
            raise ValueError("Unknown custom provider")
        del customs[cid]
        cur["custom"] = customs
        if cur["provider"] == f"custom:{cid}":
            fb = settings.LLM_PROVIDER if settings.LLM_PROVIDER in PROVIDERS else "mistral"
            cur["provider"] = fb
            cur["model"] = getattr(settings, PROVIDERS[fb]["model_attr"])
        _state = cur
        _persist()
        return {"provider": cur["provider"], "model": cur["model"]}


def list_custom() -> list[dict]:
    """Saved custom providers for the UI (id + label + model; NEVER the key)."""
    customs = get().get("custom") or {}
    return [
        {"id": cid, "label": c.get("label", "Custom"), "model": c.get("model", "")}
        for cid, c in customs.items()
    ]


def provider_has_key(provider: str) -> bool:
    if _is_custom(provider):
        c = (get().get("custom") or {}).get(_custom_id(provider)) or {}
        return bool(c.get("base_url") and c.get("api_key"))
    attr = PROVIDERS[provider]["key_attr"]
    return True if attr is None else bool(getattr(settings, attr, "").strip())


def effective() -> dict:
    """Resolved config the generator uses: base_url, api_key, model chain, flags."""
    st = get()
    provider = st["provider"]
    if _is_custom(provider):
        c = (st.get("custom") or {}).get(_custom_id(provider)) or {}
        model = c.get("model", "")
        return {
            "provider": provider,
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
