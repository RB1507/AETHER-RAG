from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import json
import structlog
from app.schemas.chat import ChatRequest, ChatHistoryResponse
from app.rag.pipeline import run_pipeline_stream
from app.rag.generator import generate_stream
from app.api.deps import get_current_user
from app.models.user import User

logger = structlog.get_logger()

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("/query/stream")
async def query_rag_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
) -> StreamingResponse:
    """
    Query the RAG pipeline and stream the response via Server-Sent Events (SSE).
    Returns retrieved sources in the first event, then streams answer tokens.
    """
    retrieved_chunks, history, sources = run_pipeline_stream(
        query=request.query,
        session_id=request.session_id,
        document_id=request.document_id,
        top_k=request.top_k,
        # Retrieval is always scoped to the requesting user's own content.
        owner=current_user.email,
        workspace_id=request.workspace_id,
    )

    async def event_generator():
        accumulated_answer = []
        
        # 1. Yield sources immediately
        sources_data = [s.model_dump() for s in sources]
        yield f"data: {json.dumps({'event': 'sources', 'sources': sources_data})}\n\n"
        
        # 2. Yield token stream from generator
        try:
            async for chunk_str in generate_stream(request.query, retrieved_chunks, history):
                chunk = json.loads(chunk_str)
                token = chunk.get("token", "")
                done = chunk.get("done", False)
                if token:
                    accumulated_answer.append(token)
                    yield f"data: {json.dumps({'event': 'token', 'token': token})}\n\n"
                if done:
                    break
            
            # 3. Save to memory if response is valid
            full_response = "".join(accumulated_answer).strip()
            if full_response and not full_response.startswith("Error:"):
                from app.services.memory_service import memory_service
                memory_service.add_message(request.session_id, "user", request.query)
                memory_service.add_message(request.session_id, "assistant", full_response)
                
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
        except Exception as e:
            logger.error("Error in query streaming route", error=str(e))
            yield f"data: {json.dumps({'event': 'error', 'error': 'Internal server error during generation.'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/{session_id}/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    current_user: User = Depends(get_current_user)
) -> ChatHistoryResponse:
    """
    Retrieves the conversation history for a given session.
    """
    from app.services.memory_service import memory_service
    history = memory_service.get_history(session_id)
    return ChatHistoryResponse(session_id=session_id, history=history)

@router.delete("/{session_id}/history")
async def clear_chat_history(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Clears the conversation history for a given session.
    """
    from app.services.memory_service import memory_service
    memory_service.clear_history(session_id)
    return {"status": "success", "message": f"Chat history for session {session_id} has been cleared"}
