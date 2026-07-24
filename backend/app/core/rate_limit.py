"""Minimal dependency-free, in-process rate limiter.

Designed for the single-process desktop backend — it protects auth endpoints
from brute-force attempts without pulling in Redis or slowapi. Limits are kept
generous so normal use (and the test suite) is never throttled, while a real
credential-stuffing burst is blocked.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class _FixedWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry = int(self.window_seconds - (now - hits[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(max(retry, 1))},
                )
            hits.append(now)


def rate_limit(max_requests: int, window_seconds: int):
    """Build a FastAPI dependency that throttles per client IP + endpoint."""
    limiter = _FixedWindowLimiter(max_requests, window_seconds)

    async def _dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        limiter.check(f"{client}:{request.url.path}")

    return _dependency


# Generous enough for normal/login-retry and test suites; blocks brute force.
login_rate_limit = rate_limit(max_requests=50, window_seconds=300)
