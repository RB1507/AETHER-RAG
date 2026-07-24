from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def run_metrics_test():
    print("=== STARTING PHASE 15 LOGGING & MONITORING TEST ===")

    # 1. Trigger some dummy requests to generate HTTP server metrics
    print("\n[Step 1] Sending dummy requests to register metrics...")
    
    # Health checks (should not inflate HTTP metrics according to middleware exclusion rule)
    res_health = client.get("/health")
    assert res_health.status_code == 200
    
    # Try invalid logins (should register as requests in metrics)
    client.post("/api/auth/login", data={"username": "nonexistent@example.com", "password": "bad"})
    client.post("/api/auth/login", data={"username": "another@example.com", "password": "bad"})

    # 2. Fetch metrics
    print("\n[Step 2] Querying /api/metrics endpoint...")
    response = client.get("/api/metrics")
    print("Metrics Response Code:", response.status_code)
    print("Metrics Response Body:\n", response.json())
    
    assert response.status_code == 200
    data = response.json()
    
    # 3. Validate structure
    assert "status" in data
    assert "database" in data
    assert "vector_store" in data
    assert "memory_store" in data
    assert "http_server" in data
    
    # Database validations
    assert "type" in data["database"]
    assert "status" in data["database"]
    assert isinstance(data["database"]["user_count"], int)
    
    # Vector store validations
    assert "status" in data["vector_store"]
    assert isinstance(data["vector_store"]["chunk_count"], int)
    
    # HTTP server validations
    server_metrics = data["http_server"]
    assert server_metrics["total_requests"] >= 2  # The two login attempts we made
    assert "active_requests" in server_metrics
    assert "average_latency_ms" in server_metrics
    assert "401" in server_metrics["status_code_counts"]  # Invalid login returns 401

    print("\nALL PHASE 15 LOGGING & MONITORING TESTS PASSED!")

def test_metrics_run():
    run_metrics_test()

if __name__ == "__main__":
    run_metrics_test()
