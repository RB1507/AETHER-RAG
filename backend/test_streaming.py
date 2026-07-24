import os
import time
import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def run_streaming_test():
    print("=== STARTING PHASE 14 STREAMING RESPONSES TEST ===")

    # 0. Setup authentication for testing
    print("\n[Auth Setup] Registering and logging in test user...")
    test_email = "stream_test_user@example.com"
    test_password = "password123"
    
    # Register
    client.post("/api/auth/register", json={"email": test_email, "password": test_password})
    
    # Login
    login_res = client.post("/api/auth/login", data={"username": test_email, "password": test_password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a temporary document file
    txt_filename = "rag_stream_test.txt"
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

        # 4. Perform Streaming Chat Query
        print("\n[Step 3] Performing streaming chat query...")
        query_payload = {
            "session_id": "sess_streaming_test",
            "query": "What does deep learning use?",
            "top_k": 3,
            "document_id": doc_id
        }
        
        sources_received = False
        tokens_received = []
        done_received = False
        
        # We use client.stream to stream the response in real time
        with client.stream("POST", "/api/chat/query/stream", json=query_payload, headers=auth_headers) as stream_response:
            print(f"Stream Response Status Code (Expected 200): {stream_response.status_code}")
            assert stream_response.status_code == 200
            
            for line in stream_response.iter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    data_str = line[len("data: "):]
                    event_data = json.loads(data_str)
                    event_type = event_data.get("event")
                    
                    if event_type == "sources":
                        print("\n[Event: sources] Reference sources received:")
                        for s in event_data["sources"]:
                            print(f" - Chunk ID: {s['chunk_id']}, Source: {s['source']}, Score: {s['score']}")
                        assert len(event_data["sources"]) > 0
                        sources_received = True
                        
                    elif event_type == "token":
                        token = event_data.get("token")
                        tokens_received.append(token)
                        # Print token inline as it streams
                        print(token, end="", flush=True)
                        
                    elif event_type == "done":
                        print("\n[Event: done] Generation complete.")
                        done_received = True
                        
                    elif event_type == "error":
                        print(f"\n[Event: error] Error: {event_data.get('error')}")
        
        assert sources_received, "Failed to receive sources event"
        assert done_received, "Failed to receive done event"
        accumulated_answer = "".join(tokens_received)
        print(f"\nAccumulated Streaming Answer:\n{accumulated_answer}")
        
        # Verify the fallback error response if Ollama is not running, or actual response
        assert len(accumulated_answer) > 0
        assert "Error" in accumulated_answer or "Could not connect" in accumulated_answer or len(accumulated_answer) > 10

        # 5. Verify conversation history in memory service
        print("\n[Step 4] Verifying saved conversation history in memory...")
        history_response = client.get("/api/chat/sess_streaming_test/history", headers=auth_headers)
        assert history_response.status_code == 200
        history_data = history_response.json()
        print("Retrieved history from API:", history_data)
        
        if accumulated_answer.startswith("Error"):
            print("Received connection error; verifying that history is empty as designed.")
            assert len(history_data["history"]) == 0
        else:
            print("Received valid streaming answer; verifying history.")
            assert len(history_data["history"]) == 2
            assert history_data["history"][0]["role"] == "user"
            assert history_data["history"][0]["content"] == "What does deep learning use?"
            assert history_data["history"][1]["role"] == "assistant"
            assert history_data["history"][1]["content"] == accumulated_answer

        print("\nALL PHASE 14 STREAMING TESTS PASSED!")

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

def test_streaming_run():
    run_streaming_test()

if __name__ == "__main__":
    run_streaming_test()
