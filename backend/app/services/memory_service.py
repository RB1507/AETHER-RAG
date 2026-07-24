import json
import redis
import structlog
from app.core.config import settings

logger = structlog.get_logger()

class MemoryService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(MemoryService, cls).__new__(cls, *args, **kwargs)
            cls._instance._redis_client = None
            cls._instance._local_history = {}
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        try:
            self._redis_client = redis.Redis.from_url(
                settings.REDIS_URL, 
                decode_responses=True,
                socket_timeout=2.0
            )
            # Test connection
            self._redis_client.ping()
            logger.info("Connected to Redis for conversation history memory", url=settings.REDIS_URL)
        except Exception as e:
            self._redis_client = None
            logger.warning("Redis not available, falling back to local memory storage", error=str(e))
        
        self._initialized = True

    def get_history(self, session_id: str, limit: int = 10) -> list[dict]:
        """
        Retrieves the last `limit` messages from conversation history for `session_id`.
        Returns a list of dicts: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}].
        """
        if self._redis_client:
            try:
                key = f"chat_history:{session_id}"
                messages_json = self._redis_client.lrange(key, -limit, -1)
                return [json.loads(msg) for msg in messages_json]
            except Exception as e:
                logger.error("Failed to retrieve chat history from Redis", error=str(e))
        
        # Fallback to local in-memory store
        history = self._local_history.get(session_id, [])
        return history[-limit:]

    def add_message(self, session_id: str, role: str, content: str) -> None:
        """
        Adds a message to the conversation history for `session_id`.
        """
        message = {"role": role, "content": content}
        if self._redis_client:
            try:
                key = f"chat_history:{session_id}"
                self._redis_client.rpush(key, json.dumps(message))
                # Set TTL to 24 hours (86400 seconds)
                self._redis_client.expire(key, 86400)
                return
            except Exception as e:
                logger.error("Failed to save message to Redis", error=str(e))

        # Fallback to local in-memory store
        if session_id not in self._local_history:
            self._local_history[session_id] = []
        self._local_history[session_id].append(message)

    def clear_history(self, session_id: str) -> None:
        """
        Deletes all conversation history for `session_id`.
        """
        if self._redis_client:
            try:
                self._redis_client.delete(f"chat_history:{session_id}")
                logger.info("Cleared chat history in Redis", session_id=session_id)
                return
            except Exception as e:
                logger.error("Failed to delete chat history from Redis", error=str(e))

        # Fallback to local in-memory store
        if session_id in self._local_history:
            del self._local_history[session_id]
            logger.info("Cleared chat history in local memory", session_id=session_id)

# Singleton memory service instance
memory_service = MemoryService()
