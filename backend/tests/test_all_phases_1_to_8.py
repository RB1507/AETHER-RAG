import asyncio
import json
import os
import shutil
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.rag.extractor import extract_text_from_file
from app.rag.chunker import chunk_text
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks, search, delete_document, collection_stats
from app.rag.retriever import retrieve
from app.rag.generator import generate_stream
from app.schemas.document import ChunkSchema, ChunkMetadata, RetrievedChunk

client = TestClient(app)
BASE_URL = "http://127.0.0.1:8000"


def _generate_full(query, context_chunks):
    """Drain generate_stream into a single answer string (test helper)."""
    async def _run():
        parts = []
        async for chunk_str in generate_stream(query, context_chunks):
            parts.append(json.loads(chunk_str).get("token", ""))
        return "".join(parts).strip()

    return asyncio.run(_run())

def run_checks_1_to_8():
    print("==================================================")
    print("           RUNNING CHECKS: PHASES 1 - 8           ")
    print("==================================================")

    # 0. Setup authentication for testing
    print("\n[Auth Setup] Registering and logging in test user...")
    test_email = "phases1_8_test_user@example.com"
    test_password = "password123"
    
    # Register
    client.post("/api/auth/register", json={"email": test_email, "password": test_password,
                "security_question": "What was the name of your first pet?", "security_answer": "rex"})
    
    # Login
    login_res = client.post("/api/auth/login", data={"username": test_email, "password": test_password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # --- Phase 1: Health check ---
    print("\n--- PHASE 1: Health check API ---")
    res1 = client.get("/health")
    print("Response:", res1.json())
    assert res1.status_code == 200
    assert res1.json()["status"] == "ok"
    assert res1.json()["version"] == "1.0.0"
    print("Phase 1: PASS")

    # --- Phase 2: File Ingestion ---
    print("\n--- PHASE 2: Ingestion API validation ---")
    # Valid file
    with open("temp_phase2.txt", "w") as f:
        f.write("Valid txt content.")
    with open("temp_phase2.txt", "rb") as f:
        res_upload = client.post(
            "/api/documents/upload", 
            files={"file": ("temp_phase2.txt", f, "text/plain")},
            headers=auth_headers
        )
    print("Valid upload status:", res_upload.status_code)
    assert res_upload.status_code == 200
    doc_id = res_upload.json()["document_id"]
    
    # Invalid extension/MIME
    with open("temp_phase2.exe", "w") as f:
        f.write("Invalid content.")
    with open("temp_phase2.exe", "rb") as f:
        res_exe = client.post(
            "/api/documents/upload", 
            files={"file": ("temp_phase2.exe", f, "application/octet-stream")},
            headers=auth_headers
        )
    print("Invalid extension upload status:", res_exe.status_code, res_exe.json())
    assert res_exe.status_code == 400
    
    # Too large
    with open("temp_large.pdf", "wb") as f:
        f.write(b"\0" * (21 * 1024 * 1024)) # 21MB
    with open("temp_large.pdf", "rb") as f:
        res_large = client.post(
            "/api/documents/upload", 
            files={"file": ("temp_large.pdf", f, "application/pdf")},
            headers=auth_headers
        )
    print("Too large upload status:", res_large.status_code, res_large.json())
    assert res_large.status_code == 400

    # Clean up Phase 2 temp files
    for fn in ["temp_phase2.txt", "temp_phase2.exe", "temp_large.pdf"]:
        if os.path.exists(fn):
            os.remove(fn)
    upload_dir = "./uploads"
    if os.path.exists(upload_dir):
        for f in os.listdir(upload_dir):
            if "temp_phase2" in f or "temp_large" in f:
                os.remove(os.path.join(upload_dir, f))
    print("Phase 2: PASS")

    # --- Phase 3: Text Extraction ---
    print("\n--- PHASE 3: Text extraction and cleaning ---")
    raw_text = "Machine\x00 learning\n\n\nis a subset  of AI.\nDeep learning uses NNs."
    cleaned = extract_text_from_file("./nonexistent.pdf")
    assert cleaned == ("", False)
    
    # Test text cleaner manually on string
    from app.utils.text_utils import clean_text
    cleaned_text = clean_text(raw_text)
    print("Cleaned text:", repr(cleaned_text))
    assert cleaned_text == "Machine learning is a subset of AI.\nDeep learning uses NNs."
    print("Phase 3: PASS")

    # --- Phase 4: Chunking System ---
    print("\n--- PHASE 4: Chunking system formatting and overlap ---")
    long_text = "Machine learning is a subset of AI. " * 40 # ~1400 chars
    chunks = chunk_text(long_text, "sample.pdf", "doc_temp")
    print(f"Generated {len(chunks)} chunks")
    assert len(chunks) > 0
    assert chunks[0].chunk_id == "chunk_000"
    assert chunks[0].metadata.source == "sample.pdf"
    assert chunks[0].metadata.document_id == "doc_temp"
    print("Chunk 0 sample:", repr(chunks[0].text[:60]))
    print("Phase 4: PASS")

    # --- Phase 5: Embedding Pipeline ---
    print("\n--- PHASE 5: Embedding pipeline dimensions ---")
    emb = embed_texts(["hello world"])
    print(f"Generated {len(emb)} vectors. Dim size: {len(emb[0])}")
    assert len(emb) == 1
    assert len(emb[0]) == 384
    print("Phase 5: PASS")

    # --- Phase 6: Vector Database ---
    print("\n--- PHASE 6: Vector database (LanceDB) ---")
    # Clean before test
    delete_document("doc_ph6")
    
    c1 = ChunkSchema(chunk_id="ch_1", text="Machine learning uses neural networks.", metadata=ChunkMetadata(source="test.txt", page=1, chunk_index=0, document_id="doc_ph6"))
    c2 = ChunkSchema(chunk_id="ch_2", text="Baking sourdough bread is an art.", metadata=ChunkMetadata(source="test.txt", page=1, chunk_index=1, document_id="doc_ph6"))
    chunks_ph6 = [c1, c2]
    embs_ph6 = embed_texts([c.text for c in chunks_ph6])
    add_chunks(chunks_ph6, embs_ph6)
    
    stats = collection_stats()
    print("Stats before delete:", stats)
    assert stats["chunk_count"] >= 2
    
    # Search
    search_res = search(embs_ph6[0], top_k=1)
    print("Search result matched ID:", search_res[0]["chunk_id"])
    assert search_res[0]["chunk_id"] == "ch_1"
    
    # Cleanup
    delete_document("doc_ph6")
    stats_after = collection_stats()
    print("Stats after delete:", stats_after)
    print("Phase 6: PASS")

    # --- Phase 7: Retrieval ---
    print("\n--- PHASE 7: Retrieval scoring and filtering ---")
    # Ingest test data
    c_ret1 = ChunkSchema(chunk_id="ret_1", text="Large Language Models are revolutionary NLP models.", metadata=ChunkMetadata(source="test.txt", page=1, chunk_index=0, document_id="doc_ph7"))
    c_ret2 = ChunkSchema(chunk_id="ret_2", text="Fresh apples are sweet and crunchy.", metadata=ChunkMetadata(source="test.txt", page=1, chunk_index=1, document_id="doc_ph7"))
    chunks_ret = [c_ret1, c_ret2]
    embs_ret = embed_texts([c.text for c in chunks_ret])
    add_chunks(chunks_ret, embs_ret)

    # Query
    retrieved = retrieve("NLP models", top_k=2, document_id="doc_ph7")
    print("Retrieved count:", len(retrieved))
    for r in retrieved:
        print(f"ID: {r.chunk_id}, Score: {r.score}, Text: {repr(r.text)}")
    # The apple chunk must be filtered out because it is unrelated (similarity < 0.5)
    assert len(retrieved) == 1
    assert retrieved[0].chunk_id == "ret_1"
    assert retrieved[0].score >= 0.5
    
    delete_document("doc_ph7")
    print("Phase 7: PASS")

    # --- Phase 8: LLM Integration ---
    print("\n--- PHASE 8: LLM Integration short-circuit & failure handling ---")
    # Empty context short circuit check
    ans1 = _generate_full("Query with empty context", [])
    print("Empty context response:", repr(ans1))
    assert ans1 == "I cannot find this in the provided documents."

    # Connection failure response check. Force an unreachable provider (Ollama at
    # a closed port) so this exercises the generator's connection-error handling
    # regardless of which real provider the environment has configured.
    from app.core.config import settings
    c_dummy = RetrievedChunk(
        chunk_id="dummy_id",
        text="Dummy text content.",
        metadata=ChunkMetadata(source="test.txt", page=1, chunk_index=0, document_id="dummy_doc"),
        score=0.9
    )
    _saved = (settings.LLM_PROVIDER, settings.OLLAMA_BASE_URL)
    settings.LLM_PROVIDER, settings.OLLAMA_BASE_URL = "ollama", "http://127.0.0.1:1"
    try:
        ans2 = _generate_full("Dummy query", [c_dummy])
    finally:
        settings.LLM_PROVIDER, settings.OLLAMA_BASE_URL = _saved
    print("Connection failure response:", repr(ans2))
    assert "Error" in ans2 or "Could not connect" in ans2
    print("Phase 8: PASS")

    print("\n==================================================")
    print("     ALL CHECKS PASSED FOR PHASES 1 TO 8!       ")
    print("==================================================")

def test_all_phases_1_to_8_run():
    run_checks_1_to_8()

if __name__ == "__main__":
    run_checks_1_to_8()
