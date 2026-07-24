import asyncio
import json
import re
import httpx
import structlog
from app.core.config import settings
from app.core import llm_state
from app.schemas.document import RetrievedChunk

logger = structlog.get_logger()

# Some models (e.g. Gemma) leak their internal special tokens into the response
# text when the provider doesn't strip them, producing runs like "<pad><pad>...".
# Remove the well-known ones defensively so answers stay clean regardless of model.
_SPECIAL_TOKENS = (
    "<pad>", "<eos>", "<bos>", "<unk>",
    "<end_of_turn>", "<start_of_turn>",
    "</s>", "<s>",
    "<|endoftext|>", "<|im_end|>", "<|im_start|>", "<|eot_id|>",
)

# Ask the provider to stop generating if it starts emitting these, so we don't
# pay for (or wait on) a trailing run of padding tokens.
_STOP_SEQUENCES = ["<pad>", "<end_of_turn>", "<eos>"]


def _strip_special_tokens(text: str) -> str:
    if not text:
        return text
    for tok in _SPECIAL_TOKENS:
        if tok in text:
            text = text.replace(tok, "")
    return text


# Degeneration guards: some models (especially free ones at low temperature)
# collapse into repeating a token ("de de de de...") or a whole phrase
# ("because shorter blue wavelengths because shorter blue wavelengths...")
# forever. The repetition penalty below makes this rare, but when it still
# happens we cut the run rather than serving pages of noise.
_DEGENERATE_TAIL_RES = (
    # One short token (<=15 chars) repeated 8+ times.
    re.compile(r"(\S{1,15})(?:\s+\1){7,}\s*$"),
    # A 2-6 word phrase repeated 4+ times.
    re.compile(r"((?:\S+\s+){1,5}\S+)(?:\s+\1){3,}\s*$"),
)


def _find_degenerate_tail(text: str) -> re.Match | None:
    for pattern in _DEGENERATE_TAIL_RES:
        m = pattern.search(text)
        if m:
            return m
    return None


def _trim_degenerate_tail(text: str) -> str:
    """Trim a trailing repetition loop, keeping a single instance."""
    m = _find_degenerate_tail(text)
    if not m:
        return text
    logger.warning("Trimmed degenerate repetition from model output", token=m.group(1))
    return (text[: m.start()] + m.group(1)).rstrip()


PROMPT_TEMPLATE = """You are a precise question-answering assistant.
Use ONLY the context provided below to answer the question.
If the answer is not in the context, say: "I cannot find this in the provided documents."
Do not add information not present in the context.
Match the level of detail the question asks for: when asked to explain in detail, write a thorough, well-structured answer that covers ALL relevant information from the context (use headings or bullet points where helpful). For simple factual questions, answer concisely.

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:"""

PROMPT_TEMPLATE_WITH_HISTORY = """You are a precise question-answering assistant.
Use ONLY the context provided below to answer the question.
If the answer is not in the context, say: "I cannot find this in the provided documents."
Do not add information not present in the context.
Match the level of detail the question asks for: when asked to explain in detail, write a thorough, well-structured answer that covers ALL relevant information from the context (use headings or bullet points where helpful). For simple factual questions, answer concisely.

CONVERSATION HISTORY:
{history}

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:"""

def build_prompt(query: str, context_chunks: list[RetrievedChunk], history: list[dict] | None = None) -> str:
    """
    Builds the final prompt string from context chunks, query, and optional conversation history.
    """
    context_str = "\n\n".join([chunk.text for chunk in context_chunks])
    
    if history:
        history_str = "\n".join([
            f"{'User' if msg['role'] == 'user' else 'Assistant'}: {msg['content']}"
            for msg in history
        ])
        return PROMPT_TEMPLATE_WITH_HISTORY.format(history=history_str, context=context_str, question=query)
        
    return PROMPT_TEMPLATE.format(context=context_str, question=query)

def _hosted_headers(api_key: str) -> dict:
    """Auth + recommended attribution headers for an OpenAI-compatible provider."""
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # Optional but recommended by OpenRouter for app attribution; ignored by
        # other providers.
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": settings.APP_NAME,
    }


# ------------------------------- Streaming --------------------------------

async def generate_stream(query: str, context_chunks: list[RetrievedChunk], history: list[dict] | None = None):
    """
    Async generator yielding token segments from the configured provider,
    normalized to JSON {"token": str, "done": bool} for the SSE layer.
    """
    if not context_chunks:
        yield json.dumps({"token": "I cannot find this in the provided documents.", "done": True})
        return

    prompt = build_prompt(query, context_chunks, history)

    # Provider + model are chosen at runtime (see llm_state), resolved per request.
    eff = llm_state.effective()
    if eff["provider"] == "ollama":
        async for chunk in _generate_ollama_stream(prompt, eff["model"]):
            yield chunk
    else:
        async for chunk in _generate_hosted_stream(prompt, eff):
            yield chunk


async def _generate_ollama_stream(prompt: str, model: str):
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "think": settings.LLM_THINK,
        "keep_alive": settings.LLM_KEEP_ALIVE,
        "options": {
            "temperature": settings.LLM_TEMPERATURE,
            "num_predict": settings.LLM_MAX_TOKENS,
            "repeat_penalty": settings.LLM_REPETITION_PENALTY,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        yield json.dumps({"token": data.get("response", ""), "done": data.get("done", False)})
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue
    except httpx.RequestError as e:
        logger.error("Ollama connection error during streaming", error=str(e), url=url)
        yield json.dumps({"token": "Error: Could not connect to the LLM generation service.", "done": True})
    except Exception as e:
        logger.error("Unexpected error in streaming generator", error=str(e))
        yield json.dumps({"token": "Error: An unexpected error occurred during streaming.", "done": True})


class _ChainState:
    """Outcome of one pass over the model chain, shared with the caller."""

    def __init__(self):
        # A model produced a complete (or deliberately cut) answer; don't retry.
        self.finished = False
        # Last HTTP status seen from a failed model, for logging.
        self.last_status: int | None = None


async def _generate_hosted_stream(prompt: str, eff: dict):
    url = f"{eff['base_url']}/chat/completions"
    state = _ChainState()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Free-tier burst limits can 429 the ENTIRE chain for a few
            # seconds; retry the whole chain once after a pause before
            # surfacing an error the user would have to retry by hand.
            for attempt in range(2):
                if attempt > 0:
                    logger.warning("Whole model chain failed; retrying once after backoff",
                                   backoff_s=4, last_status=state.last_status)
                    await asyncio.sleep(4)
                async for chunk in _stream_chain_once(client, url, prompt, state, eff):
                    yield chunk
                if state.finished:
                    return
    except httpx.RequestError as e:
        logger.error("Hosted LLM connection error during streaming", error=str(e), url=url)
        yield json.dumps({"token": "Error: Could not connect to the LLM generation service.", "done": True})
        return
    except Exception as e:
        logger.error("Unexpected error in OpenRouter streaming generator", error=str(e))
        yield json.dumps({"token": "Error: An unexpected error occurred during streaming.", "done": True})
        return
    logger.error("All OpenRouter models unavailable (stream)", last_status=state.last_status)
    yield json.dumps({"token": "All free models are busy right now (rate-limited). Please retry in a moment.", "done": True})


async def _stream_chain_once(client: httpx.AsyncClient, url: str, prompt: str, state: _ChainState, eff: dict):
    """
    One pass over the model chain, yielding JSON token events as they stream.

    OpenRouter's server-side routing (the "models" list) handles rate-limits
    and errors within a single request, so switching models usually costs no
    extra round trip. This loop is the net for what routing can't see: a model
    that accepted the request but hasn't produced its first token within
    OPENROUTER_FIRST_TOKEN_TIMEOUT_S, or one that streams garbage. Sets
    `state.finished` when a model delivered an answer (no retry needed).
    """
    if True:  # keeps the chain-loop body at its original indentation
            chain = eff["chain"]
            for i, model in enumerate(chain):
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": True,
                    "temperature": settings.LLM_TEMPERATURE,
                    "max_tokens": settings.LLM_MAX_TOKENS,
                    "stop": _STOP_SEQUENCES,
                }
                if eff["is_openrouter"]:
                    # OpenRouter-only fields; Mistral/other OpenAI-compatible
                    # providers 4xx on these. Client-side chain loop still
                    # provides fallback for those providers.
                    payload["models"] = chain[i:i + 3]  # server-side fallback (capped at 3)
                    payload["repetition_penalty"] = settings.LLM_REPETITION_PENALTY
                emitted = False
                served_by = None
                # Rolling tail of streamed text for the degeneration guard.
                tail = ""
                try:
                    # Per-request timeout so a model that is slow to even send
                    # response headers gets skipped, not waited on for the
                    # client-level 120s. Read applies per socket-read, so it
                    # also bounds mid-stream gaps at the transport level.
                    async with client.stream(
                        "POST", url, json=payload, headers=_hosted_headers(eff["api_key"]),
                        timeout=httpx.Timeout(settings.OPENROUTER_STALL_TIMEOUT_S),
                    ) as response:
                        response.raise_for_status()
                        lines = response.aiter_lines()
                        deadline = asyncio.get_running_loop().time() + settings.OPENROUTER_FIRST_TOKEN_TIMEOUT_S
                        while True:
                            if emitted:
                                # Mid-answer: bound the gap between tokens; on a
                                # stall, end with the partial answer instead of
                                # hanging (switching models now would restart
                                # the reply the user is already reading).
                                wait_s = settings.OPENROUTER_STALL_TIMEOUT_S
                            else:
                                wait_s = deadline - asyncio.get_running_loop().time()
                                if wait_s <= 0:
                                    raise TimeoutError
                            try:
                                line = await asyncio.wait_for(lines.__anext__(), timeout=wait_s)
                            except StopAsyncIteration:
                                break
                            line = line.strip()
                            if not line or not line.startswith("data:"):
                                continue
                            data_str = line[len("data:"):].strip()
                            if data_str == "[DONE]":
                                if emitted:
                                    state.finished = True
                                    yield json.dumps({"token": "", "done": True})
                                    return
                                # An explicit [DONE] with zero content is an
                                # empty completion (overloaded free model), not
                                # a success — fall through to the no-content
                                # fallback below instead of showing an empty
                                # answer bubble.
                                break
                            try:
                                data = json.loads(data_str)
                                if served_by is None and data.get("model"):
                                    served_by = data["model"]
                                    logger.info("OpenRouter streaming", served_by=served_by)
                                delta = data["choices"][0]["delta"].get("content", "") or ""
                                delta = _strip_special_tokens(delta)
                                if delta:
                                    # Cut the stream if the model has collapsed
                                    # into a repetition loop — stop paying for
                                    # (and showing) an endless "de de de...".
                                    tail = (tail + delta)[-300:]
                                    if _find_degenerate_tail(tail):
                                        logger.warning(
                                            "Stopping stream: degenerate repetition detected",
                                            model=served_by or model,
                                        )
                                        if emitted:
                                            state.finished = True
                                            yield json.dumps({"token": "", "done": True})
                                            return
                                        # Degenerate from the first delta —
                                        # nothing usable was shown; try the
                                        # next model instead.
                                        break
                                    emitted = True
                                    yield json.dumps({"token": delta, "done": False})
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
                    if emitted:
                        # Stream ended without an explicit [DONE] but a real
                        # answer was delivered; the SSE layer sends its own done.
                        state.finished = True
                        return
                    logger.warning("OpenRouter stream produced no content, trying fallback", model=model)
                except (TimeoutError, asyncio.TimeoutError, httpx.TimeoutException):
                    if emitted:
                        # Stalled mid-answer: keep what we streamed and finish.
                        logger.warning("OpenRouter stream stalled mid-answer, ending with partial text",
                                       model=served_by or model, stall_timeout_s=settings.OPENROUTER_STALL_TIMEOUT_S)
                        state.finished = True
                        yield json.dumps({"token": "", "done": True})
                        return
                    logger.warning("OpenRouter model too slow to start, trying fallback",
                                   model=model, first_token_timeout_s=settings.OPENROUTER_FIRST_TOKEN_TIMEOUT_S)
                    continue
                except httpx.HTTPStatusError as e:
                    state.last_status = e.response.status_code
                    body = await e.response.aread() if not e.response.is_closed else b""
                    logger.warning("OpenRouter stream model failed, trying fallback",
                                   model=model, status=state.last_status, body=body[:200])
                    continue
