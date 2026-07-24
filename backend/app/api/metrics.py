from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.models.user import User
from app.rag.vector_store import collection_stats
from app.services.memory_service import memory_service
from app.middleware.metrics import metrics_tracker
from app.db.database import engine

router = APIRouter(prefix="/api/metrics", tags=["metrics"])

@router.get("")
async def get_metrics(db: Session = Depends(get_db)):
    """
    Exposes system telemetry, database indicators, and API latency metrics.
    """
    # 1. Fetch user count
    try:
        user_count = db.query(User).count()
        db_status = "healthy"
    except Exception:
        user_count = 0
        db_status = "degraded"

    # 2. Fetch vector db stats
    try:
        vdb_stats = collection_stats()
        vdb_status = "healthy"
    except Exception:
        vdb_stats = {"chunk_count": 0}
        vdb_status = "degraded"

    # 3. Redis Status Check
    redis_status = "online" if memory_service._redis_client is not None else "offline (local memory fallback)"

    # 4. Extract SQLite vs PostgreSQL from engine URL
    db_type = "PostgreSQL" if engine.url.drivername.startswith("postgresql") else "SQLite (Local Fallback)"

    # 5. Get HTTP server metrics
    http_metrics = metrics_tracker.get_stats()

    return {
        "status": "healthy" if db_status == "healthy" and vdb_status == "healthy" else "degraded",
        "database": {
            "type": db_type,
            "status": db_status,
            "user_count": user_count
        },
        "vector_store": {
            "status": vdb_status,
            "chunk_count": vdb_stats["chunk_count"]
        },
        "memory_store": {
            "status": redis_status
        },
        "http_server": http_metrics
    }
