import os
import httpx

BASE_URL = "http://127.0.0.1:8000"
UPLOAD_URL = f"{BASE_URL}/api/documents/upload"

def run_tests():
    # 1. Create a temporary valid text file
    txt_filename = "test_sample.txt"
    with open(txt_filename, "w", encoding="utf-8") as f:
        f.write("Machine learning is a subset of artificial intelligence. It allows systems to learn from data.")

    # 2. Create a temporary invalid exe file
    exe_filename = "malware.exe"
    with open(exe_filename, "w", encoding="utf-8") as f:
        f.write("mock binary content")

    # 3. Create a temporary huge file (>20MB)
    huge_filename = "huge_file.pdf"
    with open(huge_filename, "wb") as f:
        # Write 21MB of zeroes
        f.write(b"\0" * (21 * 1024 * 1024))

    try:
        # Test Case 1: Valid text file upload
        print("Test 1: Uploading valid txt file...")
        with open(txt_filename, "rb") as f:
            files = {"file": (txt_filename, f, "text/plain")}
            response = httpx.post(UPLOAD_URL, files=files, timeout=10.0)
        print(f"Response code: {response.status_code}")
        print(f"Response body: {response.json()}")
        assert response.status_code == 200, "TXT upload should succeed"
        assert "document_id" in response.json()
        assert response.json()["status"] == "uploaded"

        # Test Case 2: Invalid file extension/MIME type (.exe)
        print("\nTest 2: Uploading invalid exe file...")
        with open(exe_filename, "rb") as f:
            files = {"file": (exe_filename, f, "application/octet-stream")}
            response = httpx.post(UPLOAD_URL, files=files, timeout=10.0)
        print(f"Response code: {response.status_code}")
        print(f"Response body: {response.json()}")
        assert response.status_code == 400, "EXE upload should be rejected"
        assert response.json()["detail"] == "File type not allowed"

        # Test Case 3: Too large file (>20MB)
        print("\nTest 3: Uploading huge file (>20MB)...")
        with open(huge_filename, "rb") as f:
            files = {"file": (huge_filename, f, "application/pdf")}
            response = httpx.post(UPLOAD_URL, files=files, timeout=30.0)
        print(f"Response code: {response.status_code}")
        print(f"Response body: {response.json()}")
        assert response.status_code == 400, "Huge file should be rejected"
        assert response.json()["detail"] == "File too large"

        print("\nALL INGESTION API TESTS PASSED!")

    finally:
        # Clean up temporary test files
        for fn in [txt_filename, exe_filename, huge_filename]:
            if os.path.exists(fn):
                os.remove(fn)

if __name__ == "__main__":
    run_tests()
