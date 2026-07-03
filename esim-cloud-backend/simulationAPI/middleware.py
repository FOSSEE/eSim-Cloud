"""
Structured logging middleware and utilities.

Implements Task 4 (correlation IDs + structured JSON logging) and
Task 3 (per-user concurrency limits + API rate limiting).
"""
import json
import logging
import time
import uuid
import threading

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

# Thread-local storage to carry correlation IDs within a request
_request_local = threading.local()


def get_trace_id():
    """Return the trace_id attached to the current thread, or None."""
    return getattr(_request_local, 'trace_id', None)


def get_session_id():
    return getattr(_request_local, 'session_id', None)


def get_job_id():
    return getattr(_request_local, 'job_id', None)


def set_job_id(job_id: str):
    _request_local.job_id = str(job_id) if job_id else None


# ---------------------------------------------------------------------------
# Correlation-ID Middleware (Task 4)
# ---------------------------------------------------------------------------

class CorrelationIdMiddleware(MiddlewareMixin):
    """
    Injects a unique trace_id + session_id into every request so that
    logs from the API layer, Celery workers, and the simulation runtime
    can be correlated end-to-end.

    Headers consumed (from client):
      X-Trace-Id   – if provided, adopted as the trace_id; else a new UUID
      X-Session-Id – opaque session identifier passed by the frontend

    Headers returned (to client):
      X-Trace-Id
    """

    def process_request(self, request):
        trace_id = request.headers.get('X-Trace-Id') or str(uuid.uuid4())
        session_id = request.headers.get('X-Session-Id') or request.session.session_key or ''

        _request_local.trace_id = trace_id
        _request_local.session_id = session_id
        _request_local.job_id = None

        request.trace_id = trace_id
        request.session_id = session_id

    def process_response(self, request, response):
        trace_id = getattr(request, 'trace_id', '')
        if trace_id:
            response['X-Trace-Id'] = trace_id
        return response


# ---------------------------------------------------------------------------
# Structured JSON Logging Filter (Task 4)
# ---------------------------------------------------------------------------

class StructuredJsonFormatter(logging.Formatter):
    """
    Formats every log record as a single JSON line, embedding the
    correlation IDs so log aggregators (Loki, CloudWatch, ELK) can
    index them.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': self.formatTime(record, self.datefmt),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'trace_id': get_trace_id(),
            'session_id': get_session_id(),
            'job_id': get_job_id(),
            'module': record.module,
            'lineno': record.lineno,
        }
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_data, default=str)


# ---------------------------------------------------------------------------
# Per-User Concurrency + Rate Limiting Middleware (Task 3)
# ---------------------------------------------------------------------------

class SimulationRateLimitMiddleware(MiddlewareMixin):
    """
    Enforces:
      1. Per-user API rate limit  (requests / window)
      2. Per-user concurrent simulation job limit

    Configuration (in settings.py):
      SIM_RATE_LIMIT_REQUESTS  – max requests in the time window (default 20)
      SIM_RATE_LIMIT_WINDOW    – window in seconds (default 60)
      SIM_MAX_CONCURRENT_JOBS  – max concurrent jobs per user (default 3)

    Only applies to endpoints that match SIM_RATE_LIMIT_PATHS (list of
    path prefixes, default ['/api/simulation/']).
    """

    RATE_LIMIT_REQUESTS = getattr(settings, 'SIM_RATE_LIMIT_REQUESTS', 20)
    RATE_LIMIT_WINDOW = getattr(settings, 'SIM_RATE_LIMIT_WINDOW', 60)
    MAX_CONCURRENT_JOBS = getattr(settings, 'SIM_MAX_CONCURRENT_JOBS', 3)
    RATE_LIMIT_PATHS = getattr(settings, 'SIM_RATE_LIMIT_PATHS', ['/api/simulation/'])

    def _should_limit(self, request) -> bool:
        return any(request.path.startswith(p) for p in self.RATE_LIMIT_PATHS)

    def _get_user_key(self, request) -> str:
        if request.user and request.user.is_authenticated:
            return f"user:{request.user.pk}"
        # Fall back to IP for anonymous users
        ip = (
            request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', 'unknown')
        )
        return f"ip:{ip}"

    def process_request(self, request):
        if not self._should_limit(request):
            return None

        user_key = self._get_user_key(request)
        trace_id = getattr(request, 'trace_id', '')

        # -- Rate limit check (sliding-window counter via cache) ------------
        rate_key = f"sim_rate:{user_key}"
        try:
            current = cache.get(rate_key, 0)
            if current >= self.RATE_LIMIT_REQUESTS:
                logger.warning(
                    "Rate limit exceeded",
                    extra={
                        'trace_id': trace_id,
                        'user_key': user_key,
                        'window': self.RATE_LIMIT_WINDOW,
                    }
                )
                return JsonResponse(
                    {
                        'error': 'Rate limit exceeded. Please slow down and try again.',
                        'retry_after': self.RATE_LIMIT_WINDOW,
                        'trace_id': trace_id,
                    },
                    status=429,
                    headers={'Retry-After': str(self.RATE_LIMIT_WINDOW)},
                )
            # Atomic increment
            cache.add(rate_key, 0, timeout=self.RATE_LIMIT_WINDOW)
            cache.incr(rate_key)
        except Exception:
            # Cache unavailability must not block real traffic
            logger.exception("Rate-limit cache error – allowing request")

        # -- Concurrent job limit check (POST simulation uploads only) ------
        if request.method == 'POST' and '/upload' in request.path:
            from simulationAPI.models import SimulationJob, JobStatus
            active_states = [JobStatus.QUEUED, JobStatus.DISPATCHING, JobStatus.RUNNING]
            if request.user and request.user.is_authenticated:
                active_count = SimulationJob.objects.filter(
                    owner=request.user, status__in=active_states
                ).count()
                if active_count >= self.MAX_CONCURRENT_JOBS:
                    logger.warning(
                        "Concurrent job limit hit for user %s (active=%d)",
                        request.user.pk, active_count,
                        extra={'trace_id': trace_id}
                    )
                    return JsonResponse(
                        {
                            'error': (
                                f'You already have {active_count} active simulation(s). '
                                f'Maximum concurrent jobs: {self.MAX_CONCURRENT_JOBS}.'
                            ),
                            'active_jobs': active_count,
                            'trace_id': trace_id,
                        },
                        status=429,
                    )

        return None
