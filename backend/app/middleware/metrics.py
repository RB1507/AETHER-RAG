import time
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

class MetricsTracker:
    def __init__(self):
        self.request_count = 0
        self.status_codes = {}
        self.total_latency = 0.0
        self.active_requests = 0

    def record_request(self, status_code: int, latency: float):
        self.request_count += 1
        self.total_latency += latency
        code_str = str(status_code)
        self.status_codes[code_str] = self.status_codes.get(code_str, 0) + 1

    def get_stats(self) -> dict:
        avg_latency_ms = (self.total_latency / self.request_count * 1000) if self.request_count > 0 else 0.0
        return {
            "total_requests": self.request_count,
            "active_requests": self.active_requests,
            "average_latency_ms": round(avg_latency_ms, 2),
            "status_code_counts": self.status_codes
        }

metrics_tracker = MetricsTracker()

class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Avoid counting health and metrics routes in performance logs
        path = request.url.path
        if path in ("/health", "/metrics", "/api/metrics"):
            return await call_next(request)

        metrics_tracker.active_requests += 1
        start_time = time.perf_counter()
        try:
            response = await call_next(request)
            latency = time.perf_counter() - start_time
            metrics_tracker.record_request(response.status_code, latency)
            return response
        except Exception as e:
            latency = time.perf_counter() - start_time
            metrics_tracker.record_request(500, latency)
            raise e
        finally:
            metrics_tracker.active_requests -= 1
