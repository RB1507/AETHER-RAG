import os
from app.schemas.document import ChunkSchema, ChunkMetadata
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks, delete_document, collection_stats
from app.rag.retriever import retrieve

def run_hybrid_search_test():
    print("=== STARTING PHASE 10 HYBRID SEARCH TEST ===")

    doc_id = "doc_hybrid_test"

    # 1. Clean previous state
    delete_document(doc_id)

    # 2. Add sample chunks
    chunks = [
        ChunkSchema(
            chunk_id="chunk_0",
            text="The quick brown fox jumps over the lazy dog.",
            metadata=ChunkMetadata(source="animal_trivia.txt", page=1, chunk_index=0, document_id=doc_id)
        ),
        ChunkSchema(
            chunk_id="chunk_1",
            text="Quantum computing leverages superposition and entanglement to process information.",
            metadata=ChunkMetadata(source="physics_notes.txt", page=1, chunk_index=0, document_id=doc_id)
        ),
        ChunkSchema(
            chunk_id="chunk_2",
            text="FastAPI is a modern, fast (high-performance) web framework for building APIs with Python.",
            metadata=ChunkMetadata(source="dev_docs.txt", page=1, chunk_index=0, document_id=doc_id)
        )
    ]

    print("\n[Step 1] Ingesting test documents into LanceDB...")
    embeddings = embed_texts([c.text for c in chunks])
    add_chunks(chunks, embeddings)
    
    stats = collection_stats()
    print(f"Collection size: {stats['chunk_count']} chunks.")

    try:
        # Test Case 1: Query with strong keyword overlap and semantic relevance
        print("\n[Test 1] Query: 'Quantum computing superposition'")
        results_1 = retrieve("Quantum computing superposition", top_k=2, document_id=doc_id)
        for r in results_1:
            print(f" - ID: {r.chunk_id}, Combined Score: {r.score}, Text: '{r.text}'")
        
        assert len(results_1) > 0, "Should retrieve at least one chunk"
        assert results_1[0].chunk_id == "chunk_1", "Top result should be chunk_1"

        # Test Case 2: Query with exact keyword matching
        print("\n[Test 2] Query: 'fastapi python framework'")
        results_2 = retrieve("fastapi python framework", top_k=2, document_id=doc_id)
        for r in results_2:
            print(f" - ID: {r.chunk_id}, Combined Score: {r.score}, Text: '{r.text}'")
        
        assert len(results_2) > 0, "Should retrieve at least one chunk"
        assert results_2[0].chunk_id == "chunk_2", "Top result should be chunk_2"

        # Test Case 3: Verify BM25 boosts exact keyword match that might have lower vector score
        print("\n[Test 3] Query: 'quick fox lazy'")
        results_3 = retrieve("quick fox lazy", top_k=2, document_id=doc_id)
        for r in results_3:
            print(f" - ID: {r.chunk_id}, Combined Score: {r.score}, Text: '{r.text}'")
        
        assert len(results_3) > 0, "Should retrieve at least one chunk"
        assert results_3[0].chunk_id == "chunk_0", "Top result should be chunk_0"

        print("\nALL HYBRID SEARCH TESTS PASSED!")

    finally:
        print("\n[Cleanup] Deleting test chunks from LanceDB...")
        delete_document(doc_id)

def test_hybrid_search_run():
    run_hybrid_search_test()

if __name__ == "__main__":
    run_hybrid_search_test()
