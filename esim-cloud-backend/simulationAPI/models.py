"""
Simulation API Models

Implements the Job State Machine and persistence layer for
scalability and dependability (Tasks 1, 2, 6).
"""
from django.db import models
from django.contrib.postgres.fields import JSONField
from django.core.files.storage import FileSystemStorage
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
import uuid
from saveAPI.models import StateSave


# ---------------------------------------------------------------------------
# Job State Machine
# ---------------------------------------------------------------------------

class JobStatus(models.TextChoices):
    """
    Valid states for a simulation job.
    Transitions:  QUEUED → DISPATCHING → RUNNING → SUCCEEDED | FAILED | TIMEOUT | CANCELLED
    Terminal states: SUCCEEDED, FAILED, TIMEOUT, CANCELLED  (immutable once reached)
    """
    QUEUED = 'QUEUED', 'Queued'
    DISPATCHING = 'DISPATCHING', 'Dispatching'
    RUNNING = 'RUNNING', 'Running'
    SUCCEEDED = 'SUCCEEDED', 'Succeeded'
    FAILED = 'FAILED', 'Failed'
    TIMEOUT = 'TIMEOUT', 'Timeout'
    CANCELLED = 'CANCELLED', 'Cancelled'


# Map every state to the set of states it is allowed to transition into.
VALID_TRANSITIONS = {
    JobStatus.QUEUED:       {JobStatus.DISPATCHING, JobStatus.CANCELLED, JobStatus.TIMEOUT},
    JobStatus.DISPATCHING:  {JobStatus.RUNNING, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED},
    JobStatus.RUNNING:      {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED},
    # Terminal states → no further transitions allowed
    JobStatus.SUCCEEDED:    set(),
    JobStatus.FAILED:       set(),
    JobStatus.TIMEOUT:      set(),
    JobStatus.CANCELLED:    set(),
}

TERMINAL_STATES = {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED}


class SimulationJob(models.Model):
    """
    Authoritative record for every simulation job.

    Responsibilities (Tasks 1, 2, 6):
      - Full job lifecycle state machine with valid-transition enforcement
      - Idempotency key so duplicate API calls return the existing job
      - Attempt counter + backoff metadata for the retry engine
      - Heartbeat timestamp so the stale-job recovery worker can detect
        stuck jobs
      - Audit timestamps and structured error storage
    """

    # --- Identity ---
    job_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Idempotency: caller-supplied key prevents duplicate job creation (Task 2)
    idempotency_key = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)

    # --- Ownership ---
    owner = models.ForeignKey(
        to=get_user_model(), null=True, blank=True, on_delete=models.SET_NULL,
        related_name='simulation_jobs'
    )
    session_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)

    # --- State Machine ---
    status = models.CharField(
        max_length=20,
        choices=JobStatus.choices,
        default=JobStatus.QUEUED,
        db_index=True,
    )

    # --- Retry / Backoff (Task 2) ---
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=3)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    is_retryable_failure = models.BooleanField(default=True)

    # --- Timing ---
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    # Worker heartbeat – updated by the worker every N seconds (Task 1)
    last_heartbeat_at = models.DateTimeField(null=True, blank=True)

    # --- Timeouts (seconds, 0 = no limit) ---
    queue_wait_timeout = models.IntegerField(default=300)    # 5 min
    pod_provision_timeout = models.IntegerField(default=120)  # 2 min
    execution_timeout = models.IntegerField(default=300)     # 5 min

    # --- Error Tracking ---
    error_code = models.CharField(max_length=50, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    error_history = JSONField(default=list, blank=True)

    # --- Related artefacts ---
    netlist = models.TextField(null=True, blank=True)
    result = JSONField(null=True, blank=True)
    simulation_type = models.CharField(max_length=30, default='NgSpiceSimulator')

    schematic = models.ForeignKey(
        to=StateSave, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='simulation_jobs'
    )

    # Celery task id (may differ from job_id)
    celery_task_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['owner', 'status']),
        ]

    def __str__(self):
        return f"SimulationJob({self.job_id}, {self.status})"

    # ------------------------------------------------------------------
    # State-machine helpers
    # ------------------------------------------------------------------

    def transition_to(self, new_status: str, error_code: str = None,
                      error_message: str = None) -> None:
        """
        Enforce valid state transitions and terminal-state immutability.

        Raises ValueError on illegal transition attempts so callers always
        get explicit feedback rather than silent data corruption.
        """
        current = self.status
        allowed = VALID_TRANSITIONS.get(current, set())

        if new_status not in allowed:
            raise ValueError(
                f"Illegal job transition: {current} → {new_status}. "
                f"Allowed from {current}: {allowed or 'none (terminal)'}"
            )

        now = timezone.now()
        self.status = new_status

        if new_status == JobStatus.DISPATCHING:
            self.dispatched_at = now
        elif new_status == JobStatus.RUNNING:
            self.started_at = now
            self.last_heartbeat_at = now
        elif new_status in TERMINAL_STATES:
            self.finished_at = now

        if error_code:
            self.error_code = error_code
        if error_message:
            self.error_message = error_message
            # Append to audit history (Task 6)
            history = self.error_history or []
            history.append({
                'attempt': self.attempts,
                'timestamp': now.isoformat(),
                'error_code': error_code,
                'error_message': error_message,
            })
            self.error_history = history

        self.save(update_fields=[
            'status', 'dispatched_at', 'started_at', 'finished_at',
            'last_heartbeat_at', 'error_code', 'error_message', 'error_history'
        ])

    def touch_heartbeat(self) -> None:
        """Update the worker heartbeat timestamp (Task 1)."""
        self.last_heartbeat_at = timezone.now()
        self.save(update_fields=['last_heartbeat_at'])

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATES

    @property
    def duration_seconds(self):
        if self.started_at and self.finished_at:
            return (self.finished_at - self.started_at).total_seconds()
        return None


# ---------------------------------------------------------------------------
# Legacy models – kept for backward compatibility
# ---------------------------------------------------------------------------

class Task(models.Model):
    """Legacy task model. Prefer SimulationJob for new code."""
    task_time = models.DateTimeField(auto_now=True, db_index=True)
    task_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    def save(self, *args, **kwargs):
        super(Task, self).save(*args, **kwargs)


class spiceFile(models.Model):
    file_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(storage=FileSystemStorage(location=settings.MEDIA_ROOT))
    upload_time = models.DateTimeField(auto_now=True, db_index=True)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='file')

    def save(self, *args, **kwargs):
        super(spiceFile, self).save(*args, **kwargs)


class runtimeStat(models.Model):
    """
    Stores number of simulations that completed within each second bucket.
    e.g. exec_time=1 → simulations finishing in ≤1 s.
    """
    exec_time = models.IntegerField(primary_key=True)
    qty = models.IntegerField(default=0)

    def __str__(self):
        return str(self.exec_time)

    def save(self, *args, **kwargs):
        super(runtimeStat, self).save(*args, **kwargs)


class Limit(models.Model):
    timeLimit = models.IntegerField()

    def __str__(self):
        return str(self.timeLimit)


class simulation(models.Model):
    simulation_type = models.CharField(max_length=30, null=True, blank=True)
    task = models.ForeignKey(to=Task, on_delete=models.CASCADE)
    simulation_time = models.DateTimeField(auto_now_add=True)
    schematic = models.ForeignKey(
        to=StateSave, on_delete=models.CASCADE, null=True, blank=True)
    owner = models.ForeignKey(
        to=get_user_model(), null=True, on_delete=models.CASCADE)
    netlist = models.TextField()
    result = JSONField(null=True, blank=True)
