"""
Simulation API Views

Implements:
  - Task 1 & 2: Job lifecycle + idempotency key handling
  - Task 3: Queue depth / concurrency info in responses
  - Task 4: Structured logging with correlation IDs + metrics recording
  - Task 5: Input validation / sanitization
"""
import hashlib
import math
import os
import time
import uuid
import logging

import celery.signals
from celery import current_task
from celery.result import AsyncResult

from django.conf import settings
from django.db import transaction

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ltiAPI.models import ltiSession
from saveAPI.models import StateSave

from .middleware import get_trace_id, set_job_id
from .models import (
    JobStatus, Limit, SimulationJob, Task, runtimeStat, simulation,
    spiceFile,
)
from .prometheus_metrics import (
    record_job_started, record_job_dispatched, record_job_succeeded,
    record_job_failed, record_job_timeout, record_job_retried,
)
from .serializers import (
    SimulationJobSerializer, TaskSerializer, simulationSaveSerializer,
    simulationSerializer,
)
from .tasks import process_task
from .validators import validate_netlist_input

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_time_limit() -> int:
    limits = Limit.objects.all()
    return limits[0].timeLimit if limits.exists() else 0


def saveNetlistDB(task_id, filepath, request):
    current_dir = settings.FILE_STORAGE_ROOT
    filepath = filepath.split('/')[-1]
    os.chdir(current_dir)
    with open(filepath, "r") as f:
        temp = f.read()

    owner = request.user.id if request.user.is_authenticated else None
    simulation_type = request.data.get('simulationType', 'NgSpiceSimulator')

    save_id = None
    raw_save_id = request.data.get('save_id')
    if raw_save_id and 'gallery' not in raw_save_id:
        try:
            save_id = StateSave.objects.get(
                save_id=raw_save_id,
                version=request.data['version'],
                branch=request.data['branch'],
            ).id
        except StateSave.DoesNotExist:
            logger.warning("StateSave %s not found – skipping schematic link", raw_save_id,
                           extra={'trace_id': get_trace_id()})

    lti_session = None
    if request.data.get('lti_id'):
        try:
            lti_session = ltiSession.objects.get(id=request.data['lti_id'])
        except ltiSession.DoesNotExist:
            pass

    serialized = simulationSaveSerializer(
        data={"task": task_id, "netlist": temp, "owner": owner,
              "simulation_type": simulation_type, "schematic": save_id})
    if serialized.is_valid(raise_exception=True):
        serialized.save()
        if lti_session:
            lti_session.simulations.add(simulation.objects.get(id=serialized.data['id']))
    return serialized


# ---------------------------------------------------------------------------
# Netlist Upload (Tasks 1, 2, 3, 5)
# ---------------------------------------------------------------------------

class NetlistUploader(APIView):
    """
    POST /api/simulation/upload

    Accepts a multipart/form-data request with:
      - file           : netlist file
      - simulationType : optional string
      - save_id        : optional schematic UUID
      - version        : optional
      - branch         : optional
      - lti_id         : optional
      - idempotency_key: optional – if provided and a job with this key
                          already exists the existing job is returned
                          instead of creating a duplicate (Task 2).
    """
    permission_classes = (AllowAny,)
    parser_classes = (MultiPartParser, FormParser,)

    def post(self, request, *args, **kwargs):
        trace_id = get_trace_id()
        logger.info("NetlistUploader POST received", extra={'trace_id': trace_id})

        # -- Input validation (Task 5) ---------------------------------------
        try:
            validate_netlist_input(request)
        except ValidationError as exc:
            logger.warning("Netlist input validation failed: %s", exc.detail,
                           extra={'trace_id': trace_id})
            return Response({'error': exc.detail, 'trace_id': trace_id},
                            status=status.HTTP_400_BAD_REQUEST)

        # -- Idempotency check (Task 2) --------------------------------------
        idempotency_key = request.data.get('idempotency_key') or request.headers.get('Idempotency-Key')
        if idempotency_key:
            try:
                existing_job = SimulationJob.objects.get(idempotency_key=idempotency_key)
                logger.info("Idempotency hit – returning existing job %s", existing_job.job_id,
                            extra={'trace_id': trace_id})
                set_job_id(existing_job.job_id)
                return Response({
                    'job_id': str(existing_job.job_id),
                    'status': existing_job.status,
                    'idempotent': True,
                    'trace_id': trace_id,
                })
            except SimulationJob.DoesNotExist:
                pass  # New job – proceed normally

        serializer = TaskSerializer(data=request.data, context={'view': self})
        TIME_LIMIT = _get_time_limit()

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            serializer.save()
            task_id = serializer.data['task_id']
            saveNetlistDB(task_id, serializer.data['file'][0]['file'], request)

            # Create SimulationJob record (Task 1)
            simulation_type = request.data.get('simulationType', 'NgSpiceSimulator')
            owner = request.user if request.user.is_authenticated else None
            job = SimulationJob.objects.create(
                idempotency_key=idempotency_key or None,
                owner=owner,
                session_id=request.session.session_key or '',
                simulation_type=simulation_type,
                queue_wait_timeout=getattr(settings, 'SIM_QUEUE_WAIT_TIMEOUT', 300),
                pod_provision_timeout=getattr(settings, 'SIM_POD_PROVISION_TIMEOUT', 120),
                execution_timeout=TIME_LIMIT if TIME_LIMIT else getattr(settings, 'SIM_EXECUTION_TIMEOUT', 300),
            )

        set_job_id(job.job_id)
        logger.info("SimulationJob %s created (task=%s)", job.job_id, task_id,
                    extra={'trace_id': trace_id, 'job_id': str(job.job_id)})

        # -- Dispatch to Celery (Task 3: async queue) -----------------------
        job.transition_to(JobStatus.DISPATCHING)
        record_job_started(simulation_type)

        dispatch_kwargs = {
            'kwargs': {'task_id': str(task_id), 'job_id': str(job.job_id)},
            'task_id': str(task_id),
        }
        if TIME_LIMIT:
            dispatch_kwargs['soft_time_limit'] = TIME_LIMIT

        celery_task = process_task.apply_async(**dispatch_kwargs)

        return Response({
            'job_id': str(job.job_id),
            'task_id': str(task_id),
            'state': celery_task.state,
            'status': job.status,
            'trace_id': trace_id,
            'details': serializer.data,
        })


# ---------------------------------------------------------------------------
# Job Status (Task 1 – state machine aware)
# ---------------------------------------------------------------------------

class SimulationJobStatusView(APIView):
    """
    GET /api/simulation/job/<uuid:job_id>

    Returns the current state of a SimulationJob including timing info.
    """
    permission_classes = (AllowAny,)

    def get(self, request, job_id):
        trace_id = get_trace_id()
        try:
            job = SimulationJob.objects.get(job_id=job_id)
        except SimulationJob.DoesNotExist:
            return Response({'error': 'Job not found', 'trace_id': trace_id},
                            status=status.HTTP_404_NOT_FOUND)
        serializer = SimulationJobSerializer(job)
        data = serializer.data
        data['trace_id'] = trace_id
        return Response(data)


class CancelJobView(APIView):
    """
    POST /api/simulation/job/<uuid:job_id>/cancel

    Cancels a job if it is in a non-terminal state.
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request, job_id):
        trace_id = get_trace_id()
        try:
            job = SimulationJob.objects.get(job_id=job_id)
        except SimulationJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        if job.owner != request.user:
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

        if job.is_terminal:
            return Response({'error': f'Job is already in terminal state: {job.status}'},
                            status=status.HTTP_409_CONFLICT)

        try:
            job.transition_to(JobStatus.CANCELLED)
            logger.info("Job %s cancelled by user %s", job_id, request.user.pk,
                        extra={'trace_id': trace_id})
            return Response({'job_id': str(job_id), 'status': job.status})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)


# ---------------------------------------------------------------------------
# Legacy Celery result view (preserved for backward compatibility)
# ---------------------------------------------------------------------------

class CeleryResultView(APIView):
    """
    GET /api/simulation/status/<uuid:task_id>

    Returns Celery task result – kept for backward compatibility.
    Prefer SimulationJobStatusView for new clients.
    """
    permission_classes = (AllowAny,)
    methods = ['GET']

    def get(self, request, task_id):
        trace_id = get_trace_id()
        if not isinstance(task_id, uuid.UUID):
            raise ValidationError('Invalid uuid format')

        celery_result = AsyncResult(str(task_id))
        response_data = {
            'state': celery_result.state,
            'details': celery_result.info,
            'trace_id': trace_id,
        }
        try:
            output = simulation.objects.get(task__task_id=task_id)
            output.result = celery_result.info
            output.save()
        except simulation.DoesNotExist:
            pass
        return Response(response_data)


# ---------------------------------------------------------------------------
# Simulation history views (unchanged in behaviour, logging improved)
# ---------------------------------------------------------------------------

class SimulationResults(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, save_id, sim, version, branch):
        sims = simulation.objects.filter(
            owner=self.request.user, schematic__save_id=save_id,
            schematic__version=version, schematic__branch=branch,
        )
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class SimulationResultsForLTI(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, save_id, sim, version, branch):
        sims = simulation.objects.filter(
            owner=self.request.user, schematic__save_id=save_id,
        )
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class SimulationResultsFromSimulator(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, sim):
        sims = simulation.objects.filter(
            owner=self.request.user, simulation_type=sim,
        )
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class GetLTISimResults(APIView):
    permission_classes = (AllowAny,)

    def get(self, request, lti_id):
        try:
            session = ltiSession.objects.get(id=lti_id)
            serialized = simulationSerializer(session.simulations.all(), many=True)
            return Response(serialized.data, status=status.HTTP_200_OK)
        except ltiSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Celery signal hooks for runtimeStat (preserved) + metrics
# ---------------------------------------------------------------------------

@celery.signals.task_prerun.connect
def statsd_task_prerun(task_id, **kwargs):
    current_task.start_time = time.time()


@celery.signals.task_postrun.connect
def statsd_task_postrun(task_id, **kwargs):
    runtime = math.ceil(time.time() - current_task.start_time)
    statObj, _ = runtimeStat.objects.get_or_create(exec_time=runtime)
    statObj.qty += 1
    statObj.save()
