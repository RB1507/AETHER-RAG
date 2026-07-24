import os
from fastapi.testclient import TestClient
from app.main import app
from app.services.memory_service import memory_service
from app.rag.generator import build_prompt
from app.schemas.document import RetrievedChunk, ChunkMetadata

client = TestClient(app)

def run_memory_system_test():
    print("=== STARTING PHASE 12 MEMORY SYSTEM TEST ===")

    session_id = "sess_memory_test_999"

    # 0. Setup authentication for testing
    print("\n[Auth Setup] Registering and logging in test user...")
    test_email = "mem_test_user@example.com"
    test_password = "password123"
    
    # Register
    client.post("/api/auth/register", json={"email": test_email, "password": test_password})
    
    # Login
    login_res = client.post("/api/auth/login", data={"username": test_email, "password": test_password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 1. Clean history before starting
    memory_service.clear_history(session_id)
    assert len(memory_service.get_history(session_id)) == 0

    # 2. Test Memory Service basic additions
    print("\n[Step 1] Testing Memory Service message additions...")
    memory_service.add_message(session_id, "user", "Hello, my name is Alice.")
    memory_service.add_message(session_id, "assistant", "Hi Alice! How can I help you today?")
    
    history = memory_service.get_history(session_id)
    print("Current History:", history)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Hello, my name is Alice."
    assert history[1]["role"] == "assistant"
    assert history[1]["content"] == "Hi Alice! How can I help you today?"

    # 3. Test Prompt Builder with History
    print("\n[Step 2] Testing Prompt Builder with conversation history...")
    context = [
        RetrievedChunk(
            chunk_id="ch_0",
            text="Alice is a computer scientist working on generative AI models.",
            metadata=ChunkMetadata(source="bio.txt", page=1, chunk_index=0, document_id="doc_bio"),
            score=0.9
        )
    ]
    prompt = build_prompt(
        query="What is my profession?",
        context_chunks=context,
        history=history
    )
    print("Generated Prompt:\n", prompt)
    assert "CONVERSATION HISTORY:" in prompt
    assert "Alice: Hi Alice! How can I help you today?" or "Assistant: Hi Alice! How can I help you today?" in prompt
    assert "What is my profession?" in prompt

    # 4. Test GET /api/chat/{session_id}/history endpoint
    print("\n[Step 3] Testing GET history endpoint...")
    response_get = client.get(f"/api/chat/{session_id}/history", headers=auth_headers)
    print("GET Status Code:", response_get.status_code)
    print("GET Response Body:", response_get.json())
    assert response_get.status_code == 200
    history_data = response_get.json()
    assert history_data["session_id"] == session_id
    assert len(history_data["history"]) == 2

    # 5. Test DELETE /api/chat/{session_id}/history endpoint
    print("\n[Step 4] Testing DELETE history endpoint...")
    response_del = client.delete(f"/api/chat/{session_id}/history", headers=auth_headers)
    print("DELETE Status Code:", response_del.status_code)
    print("DELETE Response Body:", response_del.json())
    assert response_del.status_code == 200
    
    # Verify history is cleared in service
    assert len(memory_service.get_history(session_id)) == 0

    # 6. Verify cleared history on GET endpoint
    response_get_cleared = client.get(f"/api/chat/{session_id}/history", headers=auth_headers)
    assert response_get_cleared.status_code == 200
    assert len(response_get_cleared.json()["history"]) == 0

    print("\nALL CONVERSATION MEMORY TESTS PASSED!")

def test_memory_system_run():
    run_memory_system_test()

if __name__ == "__main__":
    run_memory_system_test()
