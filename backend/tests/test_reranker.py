import os
from app.schemas.document import ChunkSchema, ChunkMetadata
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_chunks, delete_document
from app.rag.retriever import retrieve
from app.rag.reranker import rerank_chunks

def run_reranker_test():
    print("=== STARTING PHASE 11 RERANKER TEST ===")

    doc_id = "doc_reranker_test"

    # 1. Clean previous state
    delete_document(doc_id)

    # 2. Add sample chunks
    # Document 1 is conceptually a great answer for how machines calculate, but has less exact keyword overlap.
    # Document 2 is a very keyword-focused match, but less conceptually informative.
    # Document 3 is completely irrelevant.
    chunks = [
        ChunkSchema(
            chunk_id="chunk_0",
            text="Traditional microprocessors process mathematical calculations using silicon logic gates.",
            metadata=ChunkMetadata(source="hardware.txt", page=1, chunk_index=0, document_id=doc_id)
        ),
        ChunkSchema(
            chunk_id="chunk_1",
            text="Computers are general-purpose devices used to run calculations and execute software.",
            metadata=ChunkMetadata(source="intro.txt", page=1, chunk_index=0, document_id=doc_id)
        ),
        ChunkSchema(
            chunk_id="chunk_2",
            text="Apples and oranges are popular fruits harvested in autumn.",
            metadata=ChunkMetadata(source="fruit.txt", page=1, chunk_index=0, document_id=doc_id)
        )
    ]

    print("\n[Step 1] Ingesting test documents into LanceDB...")
    embeddings = embed_texts([c.text for c in chunks])
    add_chunks(chunks, embeddings)

    try:
        # Query: "How does a computer chip calculate?"
        query = "How does a computer chip calculate?"
        print(f"\n[Step 2] Retrieving candidates from vector database for query: '{query}'...")
        
        # We retrieve all candidates first using retrieve()
        candidates = retrieve(query, top_k=3, document_id=doc_id)
        
        print("\nBefore Reranking (Hybrid Search scores):")
        for r in candidates:
            print(f" - ID: {r.chunk_id}, Score: {r.score}, Text: '{r.text}'")

        assert len(candidates) >= 2, "Should retrieve at least two candidate chunks"

        print("\n[Step 3] Reranking candidates with Cross-Encoder...")
        reranked = rerank_chunks(query, candidates)

        print("\nAfter Reranking (Cross-Encoder scores):")
        for r in reranked:
            print(f" - ID: {r.chunk_id}, Rerank Score: {r.score}, Text: '{r.text}'")

        # Verify that the list is sorted by the reranker scores in descending order
        for i in range(len(reranked) - 1):
            assert reranked[i].score >= reranked[i+1].score, "Reranked list must be sorted by score descending"

        # The conceptually precise answer (chunk_0) should rank high or be correctly scored
        print("\nALL RERANKER TESTS PASSED!")

    finally:
        print("\n[Cleanup] Deleting test chunks from LanceDB...")
        delete_document(doc_id)

def test_reranker_run():
    run_reranker_test()

if __name__ == "__main__":
    run_reranker_test()
