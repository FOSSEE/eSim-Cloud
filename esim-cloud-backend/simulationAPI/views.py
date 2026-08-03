from simulationAPI.serializers import TaskSerializer, \
    simulationSerializer, simulationSaveSerializer
from simulationAPI.tasks import process_task, process_hdl_task
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from rest_framework.exceptions import ValidationError
from celery.result import AsyncResult
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from saveAPI.models import StateSave
import uuid
from .models import runtimeStat, Limit, simulation
from ltiAPI.models import ltiSession
import celery.signals
from celery import current_task
import time
import math
import os
import re
import logging


logger = logging.getLogger(__name__)

# Shared drf-yasg pieces -----------------------------------------------------

TASK_STATE_RESPONSE = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        'state': openapi.Schema(
            type=openapi.TYPE_STRING,
            description='Celery task state '
                        '(PENDING / STARTED / PROGRESS / SUCCESS / FAILURE)'),
        'details': openapi.Schema(
            type=openapi.TYPE_OBJECT,
            description='Task metadata on submit; parsed simulation output '
                        'once the task reaches SUCCESS'),
    })

SIM_HISTORY_RESPONSE = openapi.Response(
    description='List of stored simulation runs (netlist, result JSON, '
                'simulation_type, timestamps) for the requested schematic',
)


def saveNetlistDB(task_id, filepath, request,
                  default_sim_type="NgSpiceSimulator"):
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
        simulation_type = default_sim_type
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

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Upload a SPICE netlist for simulation',
        operation_description=(
            'Queues an **ngspice** run on a Celery worker and returns a '
            '`task_id`. Poll `GET /api/simulation/status/{task_id}` until '
            'the task state is `SUCCESS`; the parsed waveform/operating-'
            'point data is returned in `details`.\n\n'
            'The netlist must contain a ground node (node 0) and an '
            'analysis directive (`.tran`, `.ac`, `.dc` or `.op`).'),
        manual_parameters=[
            openapi.Parameter(
                'file', openapi.IN_FORM, type=openapi.TYPE_FILE,
                required=True, description='SPICE netlist (.cir/.net) file'),
            openapi.Parameter(
                'simulationType', openapi.IN_FORM,
                type=openapi.TYPE_STRING, required=False,
                description='Label stored in simulation history '
                            '(default: NgSpiceSimulator)'),
            openapi.Parameter(
                'save_id', openapi.IN_FORM, type=openapi.TYPE_STRING,
                required=False,
                description='UUID of a saved schematic to attach this run '
                            'to (with version + branch)'),
            openapi.Parameter(
                'version', openapi.IN_FORM, type=openapi.TYPE_STRING,
                required=False, description='Schematic version id'),
            openapi.Parameter(
                'branch', openapi.IN_FORM, type=openapi.TYPE_STRING,
                required=False, description='Schematic branch name'),
            openapi.Parameter(
                'lti_id', openapi.IN_FORM, type=openapi.TYPE_INTEGER,
                required=False,
                description='LTI session id to record this run against'),
        ],
        responses={
            200: openapi.Response('Task queued', TASK_STATE_RESPONSE),
            400: 'Invalid upload (missing/oversized file)',
        })
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


class HDLUploader(APIView):
    '''
    API for HDL source upload (Icarus Verilog / GHDL logic simulation).

    multipart/form-data POST:
      file          — HDL source file (Verilog testbench or VHDL file)
      simulator     — 'iverilog' | 'ghdl'
      stop_time     — optional GHDL --stop-time value (e.g. '1000ns')
      simulationType— stored in history ('IcarusVerilogSimulator' /
                      'GhdlSimulator'), defaults from simulator field

    Poll simulation/status/<task_id> for the parsed VCD payload.
    '''
    permission_classes = (AllowAny,)
    parser_classes = (MultiPartParser, FormParser,)

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Upload an HDL file (Verilog/VHDL) for simulation',
        operation_description=(
            'Queues a digital logic simulation using **Icarus Verilog** or '
            '**GHDL/NVC** and returns a `task_id`. Poll '
            '`GET /api/simulation/status/{task_id}`; on `SUCCESS` the '
            '`details` field carries the parsed VCD waveform payload.'),
        manual_parameters=[
            openapi.Parameter(
                'file', openapi.IN_FORM, type=openapi.TYPE_FILE,
                required=True,
                description='HDL source: Verilog testbench (.v) or VHDL '
                            'file (.vhd)'),
            openapi.Parameter(
                'simulator', openapi.IN_FORM, type=openapi.TYPE_STRING,
                required=False, enum=['iverilog', 'ghdl'],
                description='Simulator backend (default: iverilog)'),
            openapi.Parameter(
                'stop_time', openapi.IN_FORM, type=openapi.TYPE_STRING,
                required=False,
                description='GHDL only: --stop-time value, e.g. "1000ns" '
                            '(pattern: <int><fs|ps|ns|us|ms|sec>)'),
            openapi.Parameter(
                'simulationType', openapi.IN_FORM, type=openapi.TYPE_STRING,
                required=False,
                description='History label; defaults to '
                            'IcarusVerilogSimulator / GhdlSimulator'),
        ],
        responses={
            200: openapi.Response('Task queued', TASK_STATE_RESPONSE),
            400: 'Bad simulator name, bad stop_time format or invalid file',
        })
    def post(self, request, *args, **kwargs):
        logger.info('Got POST for HDL upload')
        simulator = request.data.get('simulator', 'iverilog')
        if simulator not in ('iverilog', 'ghdl'):
            return Response({'error': 'simulator must be iverilog or ghdl'},
                            status=status.HTTP_400_BAD_REQUEST)
        stop_time = request.data.get('stop_time', None)
        if stop_time and not re.match(r'^\d+\s*(fs|ps|ns|us|ms|sec)$',
                                      stop_time):
            return Response(
                {'error': 'stop_time must look like "1000ns"'},
                status=status.HTTP_400_BAD_REQUEST)

        serializer = TaskSerializer(data=request.data,
                                    context={'view': self})
        limits = Limit.objects.all()
        TIME_LIMIT = limits[0].timeLimit if limits.exists() else 0
        if serializer.is_valid():
            serializer.save()
            saveNetlistDB(
                serializer.data['task_id'],
                serializer.data['file'][0]['file'], request,
                default_sim_type=('IcarusVerilogSimulator'
                                  if simulator == 'iverilog'
                                  else 'GhdlSimulator'))
            task_id = serializer.data['task_id']
            task_kwargs = {'task_id': str(task_id),
                           'simulator': simulator,
                           'stop_time': stop_time}
            if TIME_LIMIT == 0:
                celery_task = process_hdl_task.apply_async(
                    kwargs=task_kwargs, task_id=str(task_id))
            else:
                celery_task = process_hdl_task.apply_async(
                    kwargs=task_kwargs, task_id=str(task_id),
                    soft_time_limit=TIME_LIMIT)

            return Response({
                'state': celery_task.state,
                'details': serializer.data,
            })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CeleryResultView(APIView):
    """

    Returns Simulation results for 'task_id' provided after
    uploading the netlist
    /api/task/<uuid>

    """
    permission_classes = (AllowAny,)
    methods = ['GET']

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Poll simulation task status / fetch results',
        operation_description=(
            'Returns the Celery state for a `task_id` obtained from any of '
            'the upload endpoints. While running, `state` is `PENDING` / '
            '`STARTED` / `PROGRESS`. On `SUCCESS`, `details` contains the '
            'parsed simulation output (graph points or VCD data); on '
            'simulation errors it contains `fail` and `error_help` keys.'),
        responses={
            200: openapi.Response('Task state', TASK_STATE_RESPONSE),
            400: 'Invalid uuid format',
        })
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

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Simulation history for a saved schematic',
        operation_description=(
            'Lists all simulation runs the authenticated user executed '
            'against a given schematic (`save_id` + `version` + `branch`). '
            'Requires `Authorization: Token <auth_token>`.'),
        responses={200: SIM_HISTORY_RESPONSE, 401: 'Not authenticated'})
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

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Simulation history for an LTI schematic',
        operation_description=(
            'Same as the schematic history endpoint but scoped for LTI '
            '(LMS) sessions: matches on `save_id` only, ignoring '
            'version/branch. Requires token auth.'),
        responses={200: SIM_HISTORY_RESPONSE, 401: 'Not authenticated'})
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

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Simulation history filtered by simulator type',
        operation_description=(
            'Lists all of the authenticated user\'s simulation runs for a '
            'given simulator label, e.g. `NgSpiceSimulator`, '
            '`IcarusVerilogSimulator`, `GhdlSimulator`.'),
        responses={200: SIM_HISTORY_RESPONSE, 401: 'Not authenticated'})
    def get(self, request, sim):
        sims = simulation.objects.filter(
            owner=self.request.user, simulation_type=sim)
        serialized = simulationSerializer(sims, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class GetLTISimResults(APIView):
    permission_classes = (AllowAny, )

    @swagger_auto_schema(
        tags=['Simulation (ngspice)'],
        operation_summary='Simulation runs recorded in an LTI session',
        operation_description=(
            'Returns every simulation attached to the given LTI session id '
            '(used by LMS instructors to inspect student attempts).'),
        responses={200: SIM_HISTORY_RESPONSE, 404: 'LTI session not found'})
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
