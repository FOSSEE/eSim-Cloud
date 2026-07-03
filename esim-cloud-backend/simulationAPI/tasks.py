"""
Celery tasks for simulation processing.

Implements:
  - Task 1: Job lifecycle state transitions inside the worker
  - Task 2: Exponential backoff + jitter retry engine, timeout categories,
             auto-cleanup on timeout/stuck jobs
  - Task 3: Per-worker heartbeat that enables stale-job detection
"""
import math
import random
import time
import traceback
import logging
import hashlib

from celery import shared_task, current_task
from celery import states as celery_states
from celery.exceptions import Ignore, SoftTimeLimitExceeded
from django.utils import timezone

from simulationAPI.helpers import ngspice_helper
from simulationAPI.models import spiceFile, SimulationJob, JobStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Error classification (Task 2: retryable vs non-retryable)
# ---------------------------------------------------------------------------

RETRYABLE_EXCEPTIONS = (
    IOError,
    OSError,
    ConnectionError,
    TimeoutError,
)

NON_RETRYABLE_EXCEPTIONS = (
    ValueError,
    TypeError,
)

RETRYABLE_ERROR_CODES = {'TRANSIENT', 'IO_ERROR', 'UNKNOWN'}
NON_RETRYABLE_ERROR_CODES = {'INVALID_NETLIST', 'SCHEMA_ERROR', 'AUTH_FAILURE'}


def _classify_error(exc: Exception):
    """Return (error_code, is_retryable) for a given exception."""
    if isinstance(exc, NON_RETRYABLE_EXCEPTIONS):
        return 'INVALID_NETLIST', False
    if isinstance(exc, RETRYABLE_EXCEPTIONS):
        return 'IO_ERROR', True
    if isinstance(exc, ngspice_helper.CannotRunSpice):
        return 'NGSPICE_FAILURE', False  # Bad netlist – not worth retrying
    return 'UNKNOWN', True


def _compute_backoff(attempt: int, base: float = 2.0,
                     cap: float = 300.0, jitter: float = 0.25) -> float:
    """
    Exponential backoff with full jitter (Task 2).
    delay = min(cap, base^attempt) * uniform(1-jitter, 1+jitter)
    """
    delay = min(cap, base ** attempt)
    return delay * random.uniform(1 - jitter, 1 + jitter)


# ---------------------------------------------------------------------------
# Heartbeat helper (Task 1 & 3)
# ---------------------------------------------------------------------------

def _heartbeat_loop(job: SimulationJob, interval: int = 10):
    """
    Touch the heartbeat timestamp every `interval` seconds while the
    simulation is running.  Called as a lightweight periodic side effect
    inside the worker – the main simulation is synchronous, so we just
    update once on entry and rely on the stale-job recovery task to detect
    long-running stuck jobs.
    """
    try:
        job.touch_heartbeat()
    except Exception:
        logger.warning("Heartbeat update failed for job %s", job.job_id)


# ---------------------------------------------------------------------------
# Main simulation task (Tasks 1, 2)
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=0)   # retries managed by our own engine
def process_task(self, task_id: str, job_id: str = None):
    """
    Executes an ngspice simulation for the given task_id.

    Args:
        task_id:  UUID of the legacy Task / spiceFile record.
        job_id:   UUID of the SimulationJob to drive through the state machine.
                  If None the legacy code-path is used without state tracking.
    """

    # -- Resolve SimulationJob (may be absent for legacy callers) ------------
    job = None
    if job_id:
        try:
            job = SimulationJob.objects.select_for_update().get(job_id=job_id)
        except SimulationJob.DoesNotExist:
            logger.error("SimulationJob %s not found – aborting task", job_id)
            return

        # Guard: only proceed if the job is still in a dispatchable state
        if job.status not in (JobStatus.QUEUED, JobStatus.DISPATCHING):
            logger.warning(
                "Job %s is in terminal/unexpected state %s – skipping",
                job_id, job.status
            )
            raise Ignore()

        try:
            job.transition_to(JobStatus.RUNNING)
        except ValueError as e:
            logger.error("Bad state transition for job %s: %s", job_id, e)
            raise Ignore()

        # Record Celery task id on the job for cross-referencing
        job.celery_task_id = self.request.id
        job.attempts += 1
        job.save(update_fields=['celery_task_id', 'attempts'])

    # -- Main simulation execution ------------------------------------------
    try:
        file_obj = list(spiceFile.objects.filter(task_id=task_id))[0]
        file_path = file_obj.file.path
        file_id = file_obj.file_id

        logger.info("Processing task=%s job=%s file=%s", task_id, job_id, file_path)

        current_task.update_state(
            state='PROGRESS',
            meta={'current_process': 'Started Processing File',
                  'job_id': str(job_id) if job_id else None}
        )

        if job:
            _heartbeat_loop(job)

        output = ngspice_helper.ExecNetlist(file_path, file_id)

        current_task.update_state(
            state='PROGRESS',
            meta={'current_process': 'Processed Netlist, Loading Output',
                  'job_id': str(job_id) if job_id else None}
        )

        # -- Persist result and transition to SUCCEEDED ----------------------
        if job:
            job.result = output
            job.save(update_fields=['result'])
            job.transition_to(JobStatus.SUCCEEDED)
            logger.info("Job %s completed successfully", job_id)

        return output

    except SoftTimeLimitExceeded:
        logger.warning("Job %s hit soft time limit (TIMEOUT)", job_id)
        if job:
            try:
                job.transition_to(
                    JobStatus.TIMEOUT,
                    error_code='EXECUTION_TIMEOUT',
                    error_message='Simulation exceeded the configured time limit.'
                )
            except ValueError:
                pass
        return {'fail': 'time limit exceeded'}

    except Exception as exc:
        error_code, is_retryable = _classify_error(exc)
        tb = traceback.format_exc()
        logger.exception("Job %s raised %s (retryable=%s)", job_id, type(exc).__name__, is_retryable)

        # -- Update Celery task state ----------------------------------------
        current_task.update_state(
            state=celery_states.FAILURE,
            meta={
                'exc_type': type(exc).__name__,
                'exc_message': tb.split('\n'),
                'error_code': error_code,
                'job_id': str(job_id) if job_id else None,
            }
        )

        if job:
            # Retry logic (Task 2: exponential backoff + jitter)
            if is_retryable and job.attempts < job.max_attempts:
                delay = _compute_backoff(job.attempts)
                next_retry = timezone.now() + timezone.timedelta(seconds=delay)
                job.next_retry_at = next_retry
                job.is_retryable_failure = True
                job.error_code = error_code
                job.error_message = str(exc)
                history = job.error_history or []
                history.append({
                    'attempt': job.attempts,
                    'timestamp': timezone.now().isoformat(),
                    'error_code': error_code,
                    'error_message': str(exc),
                })
                job.error_history = history
                # Revert to QUEUED so the retry scheduler can re-dispatch
                job.status = JobStatus.QUEUED
                job.save(update_fields=[
                    'status', 'next_retry_at', 'is_retryable_failure',
                    'error_code', 'error_message', 'error_history'
                ])
                logger.info(
                    "Job %s scheduled for retry %d/%d in %.1fs",
                    job_id, job.attempts, job.max_attempts, delay
                )
            else:
                try:
                    job.is_retryable_failure = is_retryable
                    job.save(update_fields=['is_retryable_failure'])
                    job.transition_to(
                        JobStatus.FAILED,
                        error_code=error_code,
                        error_message=str(exc)
                    )
                except ValueError:
                    pass

        raise Ignore()


# ---------------------------------------------------------------------------
# Stale-job recovery task (Task 1: worker heartbeat + stale-job recovery)
# ---------------------------------------------------------------------------

@shared_task
def recover_stale_jobs():
    """
    Periodic Celery beat task that detects and cleans up jobs stuck in
    non-terminal states without recent heartbeats.

    Schedule this via CELERY_BEAT_SCHEDULE (every 60 seconds recommended).
    """
    now = timezone.now()
    recovered = 0

    # 1. Jobs stuck RUNNING with stale heartbeat → mark TIMEOUT
    stale_threshold = now - timezone.timedelta(seconds=120)
    stale_running = SimulationJob.objects.filter(
        status=JobStatus.RUNNING,
        last_heartbeat_at__lt=stale_threshold
    )
    for job in stale_running:
        try:
            logger.warning("Recovering stale RUNNING job %s", job.job_id)
            job.transition_to(
                JobStatus.TIMEOUT,
                error_code='HEARTBEAT_LOST',
                error_message=f'Worker heartbeat not received since {job.last_heartbeat_at}'
            )
            recovered += 1
        except ValueError as e:
            logger.error("Could not recover job %s: %s", job.job_id, e)

    # 2. Jobs stuck QUEUED past queue_wait_timeout → mark TIMEOUT
    for job in SimulationJob.objects.filter(status=JobStatus.QUEUED):
        deadline = job.created_at + timezone.timedelta(seconds=job.queue_wait_timeout)
        if now > deadline:
            logger.warning("Job %s exceeded queue wait timeout", job.job_id)
            try:
                job.transition_to(
                    JobStatus.TIMEOUT,
                    error_code='QUEUE_WAIT_TIMEOUT',
                    error_message='Job waited in queue longer than the configured limit.'
                )
                recovered += 1
            except ValueError as e:
                logger.error("Could not timeout job %s: %s", job.job_id, e)

    # 3. Jobs stuck DISPATCHING past pod_provision_timeout → mark FAILED
    for job in SimulationJob.objects.filter(status=JobStatus.DISPATCHING):
        if job.dispatched_at:
            deadline = job.dispatched_at + timezone.timedelta(seconds=job.pod_provision_timeout)
            if now > deadline:
                logger.warning("Job %s exceeded pod provision timeout", job.job_id)
                try:
                    job.transition_to(
                        JobStatus.FAILED,
                        error_code='POD_PROVISION_TIMEOUT',
                        error_message='Worker did not start within the provisioning window.'
                    )
                    recovered += 1
                except ValueError as e:
                    logger.error("Could not fail job %s: %s", job.job_id, e)

    # 4. Re-queue retryable jobs whose backoff window has elapsed
    ready_for_retry = SimulationJob.objects.filter(
        status=JobStatus.QUEUED,
        next_retry_at__lte=now,
        is_retryable_failure=True,
        attempts__lt=models.F('max_attempts')
    )
    for job in ready_for_retry:
        logger.info("Re-dispatching retry for job %s (attempt %d)", job.job_id, job.attempts + 1)
        process_task.apply_async(
            kwargs={'task_id': str(job.job_id), 'job_id': str(job.job_id)},
            task_id=str(job.celery_task_id or job.job_id)
        )

    logger.info("Stale-job recovery: %d jobs recovered", recovered)
    return recovered
