import sys
import os
import traceback

def main():
    print("==================================================")
    print("      RUNNING INTEGRATION VERIFICATION RUNNER     ")
    print("==================================================")

    # Clean up local test databases to ensure clean start
    if os.path.exists("./sql_app.db"):
        try:
            os.remove("./sql_app.db")
            print("Cleaned local SQLite test database.")
        except Exception as e:
            print(f"Could not clean local SQLite DB: {e}")

    tests = [
        ("Phases 1-5 (Core Pipeline Elements)", "test_integration_1_to_5", "run_integration_check"),
        ("Phases 1-8 (Core RAG System)", "test_all_phases_1_to_8", "run_checks_1_to_8"),
        ("Phase 9 (Pipeline API)", "test_pipeline_api", "run_pipeline_verification"),
        ("Phase 10 (BM25/Semantic Hybrid Search)", "test_hybrid_search", "run_hybrid_search_test"),
        ("Phase 11 (Cross-Encoder Reranker)", "test_reranker", "run_reranker_test"),
        ("Phase 12 (Redis Memory System)", "test_memory_system", "run_memory_system_test"),
        ("Phase 13 (JWT Authentication)", "test_authentication", "run_auth_test"),
        ("Phase 14 (Streaming Responses)", "test_streaming", "run_streaming_test"),
        ("Phase 15 (Logging & Monitoring)", "test_metrics", "run_metrics_test")
    ]

    results = []

    for name, module_name, func_name in tests:
        print(f"\n\n>>> RUNNING TEST: {name} ({module_name}.py) <<<")
        try:
            # Dynamically import and run the check
            module = __import__(module_name)
            func = getattr(module, func_name)
            func()
            results.append((name, "PASS", None))
        except Exception as e:
            tb = traceback.format_exc()
            print(f"\n[FAIL] Test '{name}' failed with error: {e}")
            print(tb)
            results.append((name, "FAIL", str(e)))

    print("\n\n==================================================")
    print("              FINAL VERIFICATION REPORT           ")
    print("==================================================")
    all_passed = True
    for name, status, error in results:
        err_msg = f" (Error: {error})" if error else ""
        print(f" - {name:<45} : [{status}]{err_msg}")
        if status == "FAIL":
            all_passed = False

    print("==================================================")
    if all_passed:
        print("          ALL VERIFICATION TESTS PASSED!          ")
        print("==================================================")
        sys.exit(0)
    else:
        print("          SOME VERIFICATION TESTS FAILED.         ")
        print("==================================================")
        sys.exit(1)

if __name__ == "__main__":
    main()
