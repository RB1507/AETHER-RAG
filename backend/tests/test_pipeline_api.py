import json
import os
import time
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _stream_query(query_payload, auth_headers):
    """POST to the SSE streaming endpoint and collect (sources, answer)."""
    sources = []
    tokens = []
    done = False
    with client.stream("POST", "/api/chat/query/stream", json=query_payload,
                       headers=auth_headers) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line.strip() or not line.startswith("data: "):
                continue
            event = json.loads(line[len("data: "):])
            if event.get("event") == "sources":
                sources = event["sources"]
            elif event.get("event") == "token":
                tokens.append(event.get("token", ""))
            elif event.get("event") == "done":
                done = True
    assert done, "Stream did not send a done event"
    return sources, "".join(tokens).strip()

def run_pipeline_verification():
    print("=== STARTING PHASE 9 PIPELINE VERIFICATION ===")

    # 0. Setup authentication for testing
    print("\n[Auth Setup] Registering and logging in test user...")
    test_email = "pipe_test_user@example.com"
    test_password = "password123"
    
    # Register
    client.post("/api/auth/register", json={"email": test_email, "password": test_password,
                "security_question": "What was the name of your first pet?", "security_answer": "rex"})
    
    # Login
    login_res = client.post("/api/auth/login", data={"username": test_email, "password": test_password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a temporary document file
    txt_filename = "rag_test_doc.txt"
    content = (
        "Machine learning is a subset of artificial intelligence. It allows systems to learn from data.\n"
        "Deep learning uses neural networks with many layers to learn representations from data.\n"
        "Transformers have revolutionized natural language processing tasks significantly."
    )
    with open(txt_filename, "w", encoding="utf-8") as f:
        f.write(content)

    doc_id = None
    try:
        # 2. Upload Document
        print("\n[Step 1] Uploading document...")
        with open(txt_filename, "rb") as f:
            files = {"file": (txt_filename, f, "text/plain")}
            response = client.post("/api/documents/upload", files=files, headers=auth_headers)
        
        print(f"Upload Status Code: {response.status_code}")
        assert response.status_code == 200
        upload_data = response.json()
        doc_id = upload_data["document_id"]
        print(f"Document uploaded. ID: {doc_id}, Status: {upload_data['status']}")
        assert upload_data["status"] == "processing"

        # 3. Poll Status Endpoint
        status_url = f"/api/documents/{doc_id}/status"
        print(f"\n[Step 2] Polling status for {doc_id}...")
        completed = False
        for attempt in range(15):
            status_response = client.get(status_url, headers=auth_headers)
            status_data = status_response.json()
            print(f"Poll {attempt + 1}: Status = {status_data['status']}, Chunk Count = {status_data['chunk_count']}")
            if status_data["status"] == "completed":
                completed = True
                break
            elif status_data["status"] == "failed":
                break
            time.sleep(1.0)
        
        assert completed, "Background processing failed or timed out!"
        print("Document processing finished successfully.")

        # 4. Perform Chat Query
        print("\n[Step 3] Performing valid chat query...")
        query_payload = {
            "session_id": "sess_pipeline_test",
            "query": "What does deep learning use?",
            "top_k": 3,
            "document_id": doc_id
        }
        sources, answer = _stream_query(query_payload, auth_headers)
        print(f"Answer: {answer}")
        print("Sources:")
        for s in sources:
            print(f" - Chunk ID: {s['chunk_id']}, Source: {s['source']}, Score: {s['score']}")

        assert len(sources) > 0

        # 5. Perform Empty Retrieval Query
        print("\n[Step 4] Performing query that should trigger empty retrieval (unrelated topic)...")
        empty_payload = {
            "session_id": "sess_pipeline_test",
            "query": "How to bake a sourdough bread?",
            "top_k": 3,
            "document_id": doc_id
        }
        empty_sources, empty_answer = _stream_query(empty_payload, auth_headers)
        print(f"Answer for empty retrieval: {empty_answer}")
        print(f"Sources list (should be empty): {empty_sources}")
        assert empty_answer == "I cannot find this in the provided documents."
        assert len(empty_sources) == 0

        print("\nALL PHASE 9 PIPELINE VERIFICATION CHECKS PASSED!")

    finally:
        # Clean up local file
        if os.path.exists(txt_filename):
            os.remove(txt_filename)
        # Delete doc from LanceDB to clean vector database state
        if doc_id:
            print("\n[Cleanup] Deleting document chunks from LanceDB...")
            from app.rag.vector_store import delete_document
            delete_document(doc_id)
            # Remove from local uploads folder
            upload_dir = "./uploads"
            if os.path.exists(upload_dir):
                for f in os.listdir(upload_dir):
                    if f.endswith(txt_filename):
                        os.remove(os.path.join(upload_dir, f))

def test_pipeline_verification_run():
    run_pipeline_verification()

if __name__ == "__main__":
    run_pipeline_verification()
