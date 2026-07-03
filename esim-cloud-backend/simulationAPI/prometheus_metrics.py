"""
Prometheus metrics for the simulation pipeline (Task 4).

Exposes:
  - Job success / failure counters (by simulation_type)
  - Queue wait time histogram
  - Execution duration histogram (p50, p95, p99)
  - Timeout rate counter
  - Active job gauge per status

Usage:
  1. Add 'simulationAPI.metrics' to CELERY signals or call directly from
     views and tasks.
  2. Mount PrometheusMetricsView at /api/metrics/ in urls.py.
  3. Point your Prometheus scraper at that endpoint.

Note: requires `prometheus_client` in requirements.txt.
"""
import logging
import time as _time

logger = logging.getLogger(__name__)

# Guard import so the rest of the codebase doesn't break if prometheus_client
# is not yet installed in the current environment.
try:
    from prometheus_client import (
        Counter,
        Histogram,
        Gauge,
        CollectorRegistry,
        generate_latest,
        CONTENT_TYPE_LATEST,
        REGISTRY,
    )
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False
    logger.warning(
        "prometheus_client not installed – metrics collection disabled. "
        "Run: pip install prometheus_client"
    )


if PROMETHEUS_AVAILABLE:
    # ------------------------------------------------------------------
    # Job lifecycle counters
    # ------------------------------------------------------------------
    SIM_JOBS_STARTED = Counter(
        'esim_simulation_jobs_started_total',
        'Total simulation jobs dispatched to Celery',
        ['simulation_type'],
    )

    SIM_JOBS_SUCCEEDED = Counter(
        'esim_simulation_jobs_succeeded_total',
        'Total simulation jobs that completed successfully',
        ['simulation_type'],
    )

    SIM_JOBS_FAILED = Counter(
        'esim_simulation_jobs_failed_total',
        'Total simulation jobs that failed (retryable or terminal)',
        ['simulation_type', 'error_code'],
    )

    SIM_JOBS_TIMED_OUT = Counter(
        'esim_simulation_jobs_timeout_total',
        'Total simulation jobs that were terminated due to timeout',
        ['timeout_category'],   # EXECUTION_TIMEOUT | QUEUE_WAIT_TIMEOUT | POD_PROVISION_TIMEOUT
    )

    SIM_JOBS_RETRIED = Counter(
        'esim_simulation_jobs_retried_total',
        'Total retry attempts across all simulation jobs',
        ['simulation_type'],
    )

    # ------------------------------------------------------------------
    # Latency histograms
    # ------------------------------------------------------------------
    SIM_QUEUE_WAIT_SECONDS = Histogram(
        'esim_simulation_queue_wait_seconds',
        'Time a job waited in QUEUED state before being dispatched',
        buckets=[1, 5, 10, 30, 60, 120, 300, 600],
    )

    SIM_EXECUTION_SECONDS = Histogram(
        'esim_simulation_execution_seconds',
        'Wall-clock time from RUNNING to terminal state',
        ['simulation_type'],
        buckets=[0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    )

    SIM_POD_STARTUP_SECONDS = Histogram(
        'esim_simulation_pod_startup_seconds',
        'Time from DISPATCHING to RUNNING (worker startup/pod provision)',
        buckets=[0.5, 1, 2, 5, 10, 30, 60],
    )

    SIM_REQUEST_DURATION_SECONDS = Histogram(
        'esim_api_request_duration_seconds',
        'End-to-end API request latency',
        ['method', 'endpoint', 'status_code'],
        buckets=[0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    )

    # ------------------------------------------------------------------
    # Active-job gauge
    # ------------------------------------------------------------------
    SIM_ACTIVE_JOBS = Gauge(
        'esim_simulation_active_jobs',
        'Number of simulation jobs currently in each non-terminal state',
        ['status'],
    )


# ---------------------------------------------------------------------------
# Helper functions called from views / tasks / signals
# ---------------------------------------------------------------------------

def record_job_started(simulation_type: str = 'NgSpiceSimulator'):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_JOBS_STARTED.labels(simulation_type=simulation_type).inc()
    SIM_ACTIVE_JOBS.labels(status='QUEUED').inc()


def record_job_dispatched(queue_wait_seconds: float):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_QUEUE_WAIT_SECONDS.observe(queue_wait_seconds)
    SIM_ACTIVE_JOBS.labels(status='QUEUED').dec()
    SIM_ACTIVE_JOBS.labels(status='RUNNING').inc()


def record_job_succeeded(simulation_type: str, execution_seconds: float):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_JOBS_SUCCEEDED.labels(simulation_type=simulation_type).inc()
    SIM_EXECUTION_SECONDS.labels(simulation_type=simulation_type).observe(execution_seconds)
    SIM_ACTIVE_JOBS.labels(status='RUNNING').dec()


def record_job_failed(simulation_type: str, error_code: str):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_JOBS_FAILED.labels(simulation_type=simulation_type, error_code=error_code).inc()
    SIM_ACTIVE_JOBS.labels(status='RUNNING').dec()


def record_job_timeout(timeout_category: str):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_JOBS_TIMED_OUT.labels(timeout_category=timeout_category).inc()
    # Job could be in RUNNING or QUEUED when it times out
    try:
        SIM_ACTIVE_JOBS.labels(status='RUNNING').dec()
    except Exception:
        pass


def record_job_retried(simulation_type: str):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_JOBS_RETRIED.labels(simulation_type=simulation_type).inc()


def record_pod_startup(seconds: float):
    if not PROMETHEUS_AVAILABLE:
        return
    SIM_POD_STARTUP_SECONDS.observe(seconds)


def refresh_active_job_gauges():
    """
    Sync the active-job gauge with DB reality.
    Call this from a periodic Celery beat task or on metrics scrape.
    """
    if not PROMETHEUS_AVAILABLE:
        return
    try:
        from simulationAPI.models import SimulationJob, JobStatus
        from django.db.models import Count

        counts = (
            SimulationJob.objects
            .filter(status__in=[JobStatus.QUEUED, JobStatus.DISPATCHING, JobStatus.RUNNING])
            .values('status')
            .annotate(n=Count('pk'))
        )
        totals = {r['status']: r['n'] for r in counts}
        for s in [JobStatus.QUEUED, JobStatus.DISPATCHING, JobStatus.RUNNING]:
            SIM_ACTIVE_JOBS.labels(status=s).set(totals.get(s, 0))
    except Exception:
        logger.exception("Failed to refresh active job gauges")


# ---------------------------------------------------------------------------
# Django view to expose /metrics endpoint
# ---------------------------------------------------------------------------

if PROMETHEUS_AVAILABLE:
    from django.http import HttpResponse

    class PrometheusMetricsView:
        """
        Serve Prometheus text metrics at GET /api/metrics/.
        Mount in urls.py:
            path('api/metrics/', PrometheusMetricsView.as_view())
        """
        @classmethod
        def as_view(cls):
            def view(request):
                refresh_active_job_gauges()
                data = generate_latest(REGISTRY)
                return HttpResponse(data, content_type=CONTENT_TYPE_LATEST)
            return view
