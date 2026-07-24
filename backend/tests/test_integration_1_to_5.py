import os
from fastapi.testclient import TestClient
from app.main import app
from app.rag.extractor import extract_text_from_file
from app.rag.chunker import chunk_text
from app.rag.embedder import embed_texts

client = TestClient(app)

def run_integration_check():
    print("=== INTEGRATION CHECK FOR PHASES 1-5 ===")
    
    # 0. Setup authentication for testing
    print("\n[Auth Setup] Registering and logging in test user...")
    test_email = "int_test_user@example.com"
    test_password = "password123"
    
    # Register
    client.post("/api/auth/register", json={"email": test_email, "password": test_password})
    
    # Login
    login_res = client.post("/api/auth/login", data={"username": test_email, "password": test_password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Phase 1 Check: Health Endpoint
    print("\n[Phase 1 Check] Requesting /health...")
    response = client.get("/health")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    print("-> Phase 1 Check: PASS")
 
    # 2. Phase 2 Check: File Upload Ingestion
    print("\n[Phase 2 Check] Uploading sample valid txt file...")
    txt_filename = "sample_integration_test.txt"
    with open(txt_filename, "w", encoding="utf-8") as f:
        f.write("Machine learning is a subset of artificial intelligence. It allows systems to learn from data.\n\n\nDeep learning uses neural networks with many layers.")
        
    upload_dir = "./uploads"
    try:
        with open(txt_filename, "rb") as f:
            upload_response = client.post(
                "/api/documents/upload",
                files={"file": (txt_filename, f, "text/plain")},
                headers=auth_headers
            )
        print(f"Upload Status Code: {upload_response.status_code}")
        print(f"Upload Response: {upload_response.json()}")
        assert upload_response.status_code == 200
        doc_data = upload_response.json()
        doc_id = doc_data["document_id"]
        filename = doc_data["filename"]
        print("-> Phase 2 Check: PASS")

        # Verify file exists in the uploads directory
        saved_files = [f for f in os.listdir(upload_dir) if f.endswith(txt_filename)]
        assert len(saved_files) == 1, "File was not saved to uploads directory!"
        saved_file_path = os.path.join(upload_dir, saved_files[0])
        print(f"File verified on disk at: {saved_file_path}")

        # 3. Phase 3 Check: Text Extraction
        print("\n[Phase 3 Check] Extracting and cleaning text from uploaded file...")
        extracted_text, success = extract_text_from_file(saved_file_path)
        print(f"Extraction Success: {success}")
        print(f"Extracted Text:\n{repr(extracted_text)}")
        assert success == True
        assert len(extracted_text) > 20
        assert "\x00" not in extracted_text
        assert "\n\n\n" not in extracted_text
        print("-> Phase 3 Check: PASS")

        # 4. Phase 4 Check: Chunking
        print("\n[Phase 4 Check] Chunking text...")
        chunks = chunk_text(extracted_text, filename, doc_id)
        print(f"Total Chunks: {len(chunks)}")
        for idx, chunk in enumerate(chunks):
            print(f"Chunk {idx}: ID={chunk.chunk_id}, Len={len(chunk.text)}, Source={chunk.metadata.source}, Page={chunk.metadata.page}, Index={chunk.metadata.chunk_index}")
        assert len(chunks) > 0
        for chunk in chunks:
            assert chunk.metadata.source == filename
            assert len(chunk.text) >= 50 or len(chunks) == 1
        print("-> Phase 4 Check: PASS")

        # 5. Phase 5 Check: Embedding Generation
        print("\n[Phase 5 Check] Generating embeddings for chunks...")
        chunk_texts = [chunk.text for chunk in chunks]
        embeddings = embed_texts(chunk_texts)
        print(f"Embeddings generated: {len(embeddings)} vectors")
        assert len(embeddings) == len(chunk_texts)
        for idx, emb in enumerate(embeddings):
            print(f"Vector {idx} shape: ({len(emb)},)")
            assert len(emb) == 384
        print("-> Phase 5 Check: PASS")

        print("\n==========================================")
        print("ALL PHASES 1-5 INTEGRATION CHECKS PASSED!")
        print("==========================================")
        
    finally:
        # Clean up local temporary file
        if os.path.exists(txt_filename):
            os.remove(txt_filename)
        # Clean up uploaded files in uploads directory to avoid polluting
        if os.path.exists(upload_dir):
            for f in os.listdir(upload_dir):
                if f.endswith(txt_filename):
                    os.remove(os.path.join(upload_dir, f))

def test_integration_1_to_5_run():
    run_integration_check()

if __name__ == "__main__":
    run_integration_check()
