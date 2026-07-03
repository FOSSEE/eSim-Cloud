"""
Periodic maintenance tasks for data hygiene and orphan cleanup (Task 6 & 7).

Tasks:
  - cleanup_old_simulation_jobs: Purge jobs older than the retention window
  - cleanup_orphan_files: Remove files in file_storage not linked to any DB record
"""
import logging
import os
from pathlib import Path
from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django.conf import settings

from simulationAPI.models import SimulationJob, JobStatus, spiceFile

logger = logging.getLogger(__name__)

# Retention settings (can be overridden in settings.py or env)
JOB_RETENTION_DAYS = getattr(settings, 'SIM_JOB_RETENTION_DAYS', 30)
ARTIFACT_RETENTION_DAYS = getattr(settings, 'SIM_ARTIFACT_RETENTION_DAYS', 7)


@shared_task
def cleanup_old_simulation_jobs():
    """
    Task 6: Delete terminal SimulationJob records older than JOB_RETENTION_DAYS.

    Keeps the DB from growing unbounded while preserving recent audit trails.
    """
    cutoff = timezone.now() - timedelta(days=JOB_RETENTION_DAYS)
    terminal = list(JobStatus.SUCCEEDED.value, JobStatus.FAILED.value,
                    JobStatus.TIMEOUT.value, JobStatus.CANCELLED.value)

    deleted_count, _ = SimulationJob.objects.filter(
        status__in=terminal,
        finished_at__lt=cutoff,
    ).delete()

    logger.info(
        "Data hygiene: deleted %d old SimulationJob records (older than %d days)",
        deleted_count, JOB_RETENTION_DAYS,
    )
    return deleted_count


@shared_task
def cleanup_orphan_files():
    """
    Task 6: Remove files in MEDIA_ROOT that are no longer referenced by any
    spiceFile record in the database (zombie files from crashed workers).

    Also removes per-simulation temp directories left over from crashed workers.
    """
    media_root = Path(settings.MEDIA_ROOT)
    if not media_root.exists():
        logger.warning("MEDIA_ROOT %s does not exist – skipping orphan cleanup", media_root)
        return 0

    # Collect all file paths currently tracked in DB
    tracked_paths = set(
        spiceFile.objects.values_list('file', flat=True)
    )

    removed = 0
    for item in media_root.iterdir():
        # Remove stale per-simulation directories (UUID-named dirs)
        if item.is_dir():
            try:
                import uuid as _uuid
                _uuid.UUID(item.name)  # raises ValueError if not a UUID
                # Only remove if older than ARTIFACT_RETENTION_DAYS
                age_seconds = timezone.now().timestamp() - item.stat().st_mtime
                if age_seconds > ARTIFACT_RETENTION_DAYS * 86400:
                    import shutil
                    shutil.rmtree(item, ignore_errors=True)
                    logger.info("Removed stale simulation directory: %s", item)
                    removed += 1
            except ValueError:
                pass  # not a UUID-named dir – skip
        elif item.is_file():
            # Check if this file is tracked
            relative_path = str(item.relative_to(media_root.parent))
            if relative_path not in tracked_paths:
                age_seconds = timezone.now().timestamp() - item.stat().st_mtime
                if age_seconds > ARTIFACT_RETENTION_DAYS * 86400:
                    try:
                        item.unlink()
                        logger.info("Removed orphan file: %s", item)
                        removed += 1
                    except OSError as e:
                        logger.warning("Could not remove orphan file %s: %s", item, e)

    logger.info("Orphan cleanup complete: %d items removed", removed)
    return removed
