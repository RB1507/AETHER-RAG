import os
import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def run_auth_test():
    print("=== STARTING PHASE 13 AUTHENTICATION TEST ===")

    # Unique per-run email so a persisted user from a previous run cannot make
    # the "expect 201 on register" assertion fail (test isolation).
    email = f"auth_test_user_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "securepassword123"

    # Clean local sqlite database if exists to ensure clean run
    if os.path.exists("./sql_app.db"):
        try:
            # We can't delete easily if open, but SQLAlchemy create_all will run clean on new tables
            pass
        except Exception:
            pass

    # 1. Access protected route without authorization -> Expect 401
    print("\n[Test 1] Accessing protected endpoint without authorization header...")
    response = client.get("/api/chat/sess_test/history")
    print("Response Status Code (Expected 401):", response.status_code)
    print("Response Body:", response.json())
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"

    # 2. Register user -> Expect 201
    print("\n[Test 2] Registering a new test user...")
    reg_payload = {"email": email, "password": pwd,
                   "security_question": "What was the name of your first pet?",
                   "security_answer": "rex"}
    response_reg = client.post("/api/auth/register", json=reg_payload)
    print("Registration Status Code (Expected 201):", response_reg.status_code)
    print("Registration Response Body:", response_reg.json())
    assert response_reg.status_code == 201
    assert response_reg.json()["email"] == email
    assert "id" in response_reg.json()

    # 3. Register same user again -> Expect 400
    print("\n[Test 3] Registering the duplicate user email...")
    response_dup = client.post("/api/auth/register", json=reg_payload)
    print("Duplicate Registration Status Code (Expected 400):", response_dup.status_code)
    assert response_dup.status_code == 400
    assert response_dup.json()["detail"] == "Email already registered"

    # 4. Login with correct credentials -> Expect 200
    print("\n[Test 4] Logging in with correct credentials...")
    login_data = {"username": email, "password": pwd}
    response_login = client.post("/api/auth/login", data=login_data)
    print("Login Status Code (Expected 200):", response_login.status_code)
    print("Login Response Body:", response_login.json())
    assert response_login.status_code == 200
    token_info = response_login.json()
    assert "access_token" in token_info
    assert token_info["token_type"] == "bearer"
    token = token_info["access_token"]

    # 5. Login with incorrect credentials -> Expect 401
    print("\n[Test 5] Logging in with incorrect credentials...")
    response_bad_login = client.post("/api/auth/login", data={"username": email, "password": "wrong_password"})
    print("Bad Login Status Code (Expected 401):", response_bad_login.status_code)
    assert response_bad_login.status_code == 401

    # 6. Fetch /me endpoint with correct header -> Expect 200
    print("\n[Test 6] Accessing /api/auth/me with Bearer token...")
    auth_headers = {"Authorization": f"Bearer {token}"}
    response_me = client.get("/api/auth/me", headers=auth_headers)
    print("Fetch Me Status Code (Expected 200):", response_me.status_code)
    print("Fetch Me Response Body:", response_me.json())
    assert response_me.status_code == 200
    assert response_me.json()["email"] == email

    # 7. Fetch protected history endpoint with correct header -> Expect 200
    print("\n[Test 7] Accessing protected history endpoint with Bearer token...")
    response_history = client.get("/api/chat/sess_test/history", headers=auth_headers)
    print("History Status Code (Expected 200):", response_history.status_code)
    print("History Response Body:", response_history.json())
    assert response_history.status_code == 200
    assert response_history.json()["session_id"] == "sess_test"

    print("\nALL AUTHENTICATION TESTS PASSED!")

def test_authentication_run():
    run_auth_test()

if __name__ == "__main__":
    run_auth_test()
