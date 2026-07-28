"""End-to-end smoke test: the RAG happy path in-process, no server/ports/LLM key.

upload a document -> it gets indexed -> a query retrieves it with a real
citation. Asserts retrieval/grounding only (the `sources` SSE event), which is
independent of the LLM, so it needs no API key. This is the one check that
fails loudly if ingest->embed->retrieve breaks end to end.

Isolated: temp LANCE_URI/UPLOAD_DIR/DATABASE_URL are set BEFORE importing the
app so it never touches dev data. Reuses the real embedding cache (no download).
"""
import os
import json
import tempfile

_TMP = tempfile.mkdtemp(prefix="aether_smoke_")
os.environ["LANCE_URI"] = os.path.join(_TMP, "vector_store")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_TMP, "smoke.db").replace(os.sep, "/")

from types import SimpleNamespace  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.api.deps import get_current_user  # noqa: E402

# Skip real auth — this test exercises the RAG pipeline, not login.
app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(email="smoke@test.local")
client = TestClient(app)


def test_upload_then_query_returns_grounded_citation():
    # 1. Upload a document with a distinctive fact.
    content = b"The capital of France is Paris. Paris sits on the river Seine."
    r = client.post(
        "/api/documents/upload",
        files={"file": ("france.txt", content, "text/plain")},
    )
    assert r.status_code == 200, r.text
    doc_id = r.json()["document_id"]

    # 2. TestClient runs FastAPI background tasks synchronously, so indexing is
    #    already done — but poll a few times in case that ever changes.
    status = None
    for _ in range(20):
        s = client.get(f"/api/documents/{doc_id}/status").json()
        status = s["status"]
        if status in ("completed", "failed"):
            break
    assert status == "completed", f"indexing did not complete: {status}"

    # 3. Query it. The first SSE event carries retrieved sources (no LLM needed).
    r = client.post(
        "/api/chat/query/stream",
        json={"query": "What is the capital of France?", "session_id": "smoke"},
    )
    assert r.status_code == 200, r.text

    sources = None
    for line in r.text.splitlines():
        if line.startswith("data: "):
            evt = json.loads(line[len("data: "):])
            if evt.get("event") == "sources":
                sources = evt["sources"]
                break

    assert sources, "no sources event / empty retrieval — grounding is broken"
    assert any("Paris" in (s.get("text") or "") for s in sources), \
        "retrieved passage does not contain the indexed fact"


if __name__ == "__main__":
    import sys
    import pytest
    sys.exit(pytest.main([__file__, "-q"]))
