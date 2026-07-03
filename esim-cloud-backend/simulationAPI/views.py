from simulationAPI.serializers import TaskSerializer, \
    simulationSerializer, simulationSaveSerializer
from simulationAPI.tasks import process_task
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from rest_framework.exceptions import ValidationError
from celery.result import AsyncResult
from saveAPI.models import StateSave
import uuid
from .models import runtimeStat, Limit, simulation
from ltiAPI.models import ltiSession
import celery.signals
from celery import current_task
import time
import math
import os
import logging


logger = logging.getLogger(__name__)


def saveNetlistDB(task_id, filepath, request):
    current_dir = settings.FILE_STORAGE_ROOT
    filepath = filepath.split('/')[-1]
    os.chdir(current_dir)
    f = open(filepath, "r")
    temp = f.read()
    if request.user.is_authenticated:
        owner = request.user.id
    else:
        owner = None
    if request.data.get('simulationType', None):
        simulation_type = request.data['simulationType']
    else:
        simulation_type = "NgSpiceSimulator"
    if request.data.get('save_id', None):
        if 'gallery' in request.data.get('save_id'):
            save_id = None
        else:
            save_id = StateSave.objects.get(
                save_id=request.data['save_id'],
                version=request.data['version'],
                branch=request.data['branch']).id
    else:
        save_id = None
    lti_session = None
    if request.data.get('lti_id', None):
        lti_session = ltiSession.objects.get(id=request.data['lti_id'])
    serialized = simulationSaveSerializer(
        data={"task": task_id, "netlist": temp, "owner": owner,
              "simulation_type": simulation_type, "schematic": save_id})
    if serialized.is_valid(raise_exception=True):
        serialized.save()
        if lti_session:
            lti_session.simulations.add(
                simulation.objects.get(id=serialized.data['id']))
        return
    else:
        return Response(serialized.errors)


class NetlistUploader(APIView):
    '''
    API for NetlistUpload

    Requires a multipart/form-data  POST Request with netlist file in the
    'file' parameter
    '''
    permission_classes = (AllowAny,)
    parser_classes = (MultiPartParser, FormParser,)

    def post(self, request, *args, **kwargs):
        logger.info('Got POST for netlist upload: ')
        logger.info(request.data)
        serializer = TaskSerializer(data=request.data, context={'view': self})

        limits = Limit.objects.all()
        TIME_LIMIT = 0
        if limits.exists():
            TIME_LIMIT = Limit.objects.all()[0].timeLimit
        # if timeLimit.objects.count() != 0:
        #     TIME_LIMIT = timeLimit.objects.all()[0]
        #     print('NOT NONE')
        # else:
        #     print('NONE')
        if serializer.is_valid():
            serializer.save()
            saveNetlistDB(
                serializer.data['task_id'], serializer.data['file'][0]['file'],
                request)
            task_id = serializer.data['task_id']
            if(TIME_LIMIT == 0):
                celery_task = process_task.apply_async(
                    kwargs={'task_id': str(task_id)}, task_id=str(task_id)
                )
            else:
                celery_task = process_task.apply_async(
                    kwargs={'task_id': str(task_id)}, task_id=str(task_id),
                    soft_time_limit=TIME_LIMIT)

            response_data = {
                'state': celery_task.state,
                'details': serializer.data,
            }
            return Response(response_data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CeleryResultView(APIView):
    """

    Returns Simulation results for 'task_id' provided after
    uploading the netlist
    /api/task/<uuid>

    """
    permission_classes = (AllowAny,)
    methods = ['GET']

    def get(self, request, task_id):

        if isinstance(task_id, uuid.UUID):
            celery_result = AsyncResult(str(task_id))
            response_data = {
                'state': celery_result.state,
                'details': celery_result.info
            }
            try:
                Output = simulation.objects.get(task__task_id=task_id)
                Output.result = celery_result.info
                Output.save()
            except simulation.DoesNotExist:
                pass
            return Response(response_data)
        else:
            raise ValidationError('Invalid uuid format')


class SimulationResults(APIView):
    permission_classes = (IsAuthenticated, )

    def get(self, request, save_id, sim, version, branch):
        if sim is None:
            sims = simulation.objects.filter(
                owner=self.request.user, schematic__save_id=save_id,
                schematic__version=version, schematic__branch=branch
            )
        else:
            sims = simulation.objects.filter(
                owner=self.request.user, schematic__save_id=save_id,
                schematic__version=version, schematic__branch=branch
            )
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class SimulationResultsForLTI(APIView):
    permission_classes = (IsAuthenticated, )

    def get(self, request, save_id, sim, version, branch):
        if sim is None:
            sims = simulation.objects.filter(
                owner=self.request.user, schematic__save_id=save_id
            )
        else:
            sims = simulation.objects.filter(
                owner=self.request.user, schematic__save_id=save_id
            )
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class SimulationResultsFromSimulator(APIView):
    permission_classes = (IsAuthenticated, )

    def get(self, request, sim):
        sims = simulation.objects.filter(
            owner=self.request.user, simulation_type=sim)
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class GetLTISimResults(APIView):
    permission_classes = (AllowAny, )

    def get(self, request, lti_id):
        try:
            session = ltiSession.objects.get(id=lti_id)
            serialized = simulationSerializer(
                session.simulations.all(), many=True)
            return Response(serialized.data, status=status.HTTP_200_OK)
        except ltiSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


@ celery.signals.task_prerun.connect
def statsd_task_prerun(task_id, **kwargs):
    current_task.start_time = time.time()


@ celery.signals.task_postrun.connect
def statsd_task_postrun(task_id, **kwargs):
    runtime = time.time() - current_task.start_time
    runtime = math.ceil(runtime)
    statObj, created = runtimeStat.objects.get_or_create(exec_time=runtime)
    statObj.qty += 1
    statObj.save()
# =========================================================================
# Parametric Sweep (Phase 1)
# =========================================================================
import math as _math
from .models import SweepRun, SweepStep
from simulationAPI.tasks import run_sweep_step


def _gen_values(start, stop, count, scale='lin'):
    if count < 2:
        return [start]
    if scale == 'log':
        a, b = _math.log10(start), _math.log10(stop)
        return [10 ** (a + (b - a) * i / (count - 1)) for i in range(count)]
    return [start + (stop - start) * i / (count - 1) for i in range(count)]


class SweepSimulateView(APIView):
    """
    Start a parametric sweep.

    POST /api/sweep-simulate/
    Body (JSON):
      base_netlist (str), component (str, e.g. "r1"),
      start_value (float), stop_value (float),
      step_count (int), scale ("lin"|"log", default "lin"),
      save_id (optional, schematic StateSave save_id)

    Creates a SweepRun + N SweepStep rows, dispatches N independent
    Celery tasks, returns the sweep_run id to poll.
    """
    permission_classes = (AllowAny,)

    MAX_STEPS = 50  # per-sweep concurrency cap (mentor Q: 10/20/50)

    def post(self, request, *args, **kwargs):
        d = request.data
        try:
            base_netlist = d['base_netlist']
            component = d['component']
            start_value = float(d['start_value'])
            stop_value = float(d['stop_value'])
            step_count = int(d['step_count'])
        except (KeyError, TypeError, ValueError):
            return Response(
                {'detail': 'Required: base_netlist, component, start_value, '
                 'stop_value, step_count.'},
                status=status.HTTP_400_BAD_REQUEST)

        scale = d.get('scale', 'lin')
        if scale not in ('lin', 'log'):
            return Response({'detail': 'scale must be "lin" or "log".'},
                            status=status.HTTP_400_BAD_REQUEST)
        if step_count < 1 or step_count > self.MAX_STEPS:
            return Response(
                {'detail': 'step_count must be 1..{}.'.format(self.MAX_STEPS)},
                status=status.HTTP_400_BAD_REQUEST)
        if scale == 'log' and (start_value <= 0 or stop_value <= 0):
            return Response(
                {'detail': 'log scale requires positive start/stop values.'},
                status=status.HTTP_400_BAD_REQUEST)

        save_obj = None
        if d.get('save_id'):
            try:
                save_obj = StateSave.objects.get(
                    save_id=d['save_id'], version=d.get('version'),
                    branch=d.get('branch'))
            except StateSave.DoesNotExist:
                save_obj = None

        owner = request.user if request.user.is_authenticated else None
        values = _gen_values(start_value, stop_value, step_count, scale)

        run = SweepRun.objects.create(
            owner=owner, schematic=save_obj, base_netlist=base_netlist,
            component=component, start_value=start_value,
            stop_value=stop_value, step_count=step_count, scale=scale,
            total_steps=len(values),
        )

        steps = [
            SweepStep.objects.create(
                sweep_run=run, step_index=i, value=v)
            for i, v in enumerate(values)
        ]

        # dispatch one independent task per step (parallel + isolated)
        for step in steps:
            run_sweep_step.apply_async(
                kwargs={'sweep_run_id': str(run.id),
                        'step_id': str(step.id)})

        return Response(
            {'sweep_run_id': str(run.id),
             'total_steps': run.total_steps,
             'values': values,
             'status': run.status},
            status=status.HTTP_201_CREATED)


class SweepResultView(APIView):
    """
    Poll a sweep's progress + results.

    GET /api/sweep-simulate/<uuid:sweep_run_id>/
    Returns parent progress and every step (index, value, status, result).
    """
    permission_classes = (AllowAny,)

    def get(self, request, sweep_run_id):
        try:
            run = SweepRun.objects.get(id=sweep_run_id)
        except SweepRun.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        steps = [
            {'step_index': s.step_index, 'value': s.value,
             'status': s.status, 'result': s.result, 'error': s.error}
            for s in run.steps.all()
        ]
        return Response({
            'sweep_run_id': str(run.id),
            'status': run.status,
            'component': run.component,
            'scale': run.scale,
            'total_steps': run.total_steps,
            'completed_steps': run.completed_steps,
            'steps': steps,
        }, status=status.HTTP_200_OK)
