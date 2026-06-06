from simulationAPI.serializers import TaskSerializer, \
    simulationSerializer, simulationSaveSerializer, \
    SpiceModelSerializer, SpiceModelDetailSerializer, \
    SpiceModelUploadSerializer
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
import json
from .models import runtimeStat, Limit, simulation, SpiceModel
from simulationAPI.helpers.spice_model_parser import sanitize_spice_model
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
    'file' parameter.

    Optional field (Issue #539):
    - custom_model_ids: JSON array of SpiceModel UUID strings to inject
      into the netlist before simulation. Example: '["uuid1", "uuid2"]'
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

            # ---------------------------------------------------------------
            # Issue #539: Extract optional custom_model_ids from request
            # ---------------------------------------------------------------
            model_ids = None
            raw_model_ids = request.data.get('custom_model_ids', None)
            if raw_model_ids:
                try:
                    if isinstance(raw_model_ids, str):
                        model_ids = json.loads(raw_model_ids)
                    elif isinstance(raw_model_ids, list):
                        model_ids = raw_model_ids
                    # Validate each ID is a valid UUID string
                    if model_ids:
                        for mid in model_ids:
                            uuid.UUID(str(mid))
                except (json.JSONDecodeError, ValueError) as e:
                    return Response(
                        {'custom_model_ids': 'Invalid format. '
                         'Expected a JSON array of UUID strings.'},
                        status=status.HTTP_400_BAD_REQUEST)
            # ---------------------------------------------------------------

            celery_kwargs = {'task_id': str(task_id)}
            if model_ids:
                celery_kwargs['model_ids'] = model_ids

            if(TIME_LIMIT == 0):
                celery_task = process_task.apply_async(
                    kwargs=celery_kwargs, task_id=str(task_id)
                )
            else:
                celery_task = process_task.apply_async(
                    kwargs=celery_kwargs, task_id=str(task_id),
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


# =========================================================================
# Custom SPICE Model Views (Issue #539)
# =========================================================================

class SpiceModelUploadView(APIView):
    """
    Upload a custom SPICE model file (.subckt, .lib, .model).

    POST /api/simulation/models/upload
    Content-Type: multipart/form-data
    Authorization: Token <token>

    Fields:
    - file: The SPICE model file
    - name: Human-readable name (unique per user)
    - model_type: 'subckt' | 'lib' | 'model'
    - description: (optional) Description of the model

    The file is validated through the whitelist sanitizer. If sanitization
    fails, a 400 is returned with detailed error messages. Models are
    auto-approved for personal use; is_approved gates gallery publishing.
    """
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser,)

    def post(self, request, *args, **kwargs):
        logger.info('SpiceModel upload from user: %s', request.user.username)

        serializer = SpiceModelUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = serializer.validated_data
        validation_result = validated.pop('_validation_result')

        # Check for unique_together conflict before create
        if SpiceModel.objects.filter(
                owner=request.user, name=validated['name']).exists():
            return Response(
                {'name': 'You already have a model named "{}". '
                 'Please choose a different name or delete the '
                 'existing one.'.format(validated['name'])},
                status=status.HTTP_409_CONFLICT)

        model_obj = SpiceModel.objects.create(
            owner=request.user,
            name=validated['name'],
            model_type=validated['model_type'],
            description=validated.get('description', ''),
            raw_content=validated['raw_content'],
            sanitized_content=validated['sanitized_content'],
            subckt_name=validated['subckt_name'],
            pin_count=validated['pin_count'],
        )

        response_serializer = SpiceModelSerializer(model_obj)
        response_data = response_serializer.data
        response_data['validation'] = validation_result

        logger.info(
            'SpiceModel created: %s (id: %s)', model_obj.name, model_obj.id)
        return Response(response_data, status=status.HTTP_201_CREATED)


class SpiceModelListView(APIView):
    """
    List the current user's uploaded SPICE models.

    GET /api/simulation/models/
    Authorization: Token <token>
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        models = SpiceModel.objects.filter(owner=request.user)
        serialized = SpiceModelSerializer(models, many=True)
        return Response(serialized.data, status=status.HTTP_200_OK)


class SpiceModelDetailView(APIView):
    """
    Retrieve or delete a specific SPICE model.

    GET /api/simulation/models/<uuid:pk>
    DELETE /api/simulation/models/<uuid:pk>
    Authorization: Token <token>

    Only the model owner can access their own models.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk):
        try:
            model_obj = SpiceModel.objects.get(id=pk, owner=request.user)
        except SpiceModel.DoesNotExist:
            return Response(
                {'detail': 'Model not found or you do not have permission.'},
                status=status.HTTP_404_NOT_FOUND)

        serialized = SpiceModelDetailSerializer(model_obj)
        return Response(serialized.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        try:
            model_obj = SpiceModel.objects.get(id=pk, owner=request.user)
        except SpiceModel.DoesNotExist:
            return Response(
                {'detail': 'Model not found or you do not have permission.'},
                status=status.HTTP_404_NOT_FOUND)

        model_name = model_obj.name
        model_obj.delete()
        logger.info(
            'SpiceModel deleted: %s (id: %s) by user %s',
            model_name, pk, request.user.username)
        return Response(
            {'detail': 'Model "{}" deleted successfully.'.format(model_name)},
            status=status.HTTP_200_OK)


class SpiceModelValidateView(APIView):
    """
    Re-validate an existing SPICE model through the sanitizer.

    POST /api/simulation/models/<uuid:pk>/validate
    Authorization: Token <token>

    Useful after sanitizer rule updates — re-runs the whitelist parser on
    the stored raw_content and updates sanitized_content if valid.
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        try:
            model_obj = SpiceModel.objects.get(id=pk, owner=request.user)
        except SpiceModel.DoesNotExist:
            return Response(
                {'detail': 'Model not found or you do not have permission.'},
                status=status.HTTP_404_NOT_FOUND)

        result = sanitize_spice_model(model_obj.raw_content)

        if result.is_valid:
            # Update stored sanitized content and metadata
            model_obj.sanitized_content = result.sanitized_content
            model_obj.subckt_name = result.metadata.get('subckt_name', '')
            model_obj.pin_count = result.metadata.get('pin_count', 0)
            model_obj.save()
            logger.info('SpiceModel re-validated: %s (id: %s) — VALID',
                        model_obj.name, model_obj.id)
        else:
            logger.warning('SpiceModel re-validated: %s (id: %s) — INVALID',
                           model_obj.name, model_obj.id)

        response_data = SpiceModelSerializer(model_obj).data
        response_data['validation'] = result.to_dict()
        return Response(response_data, status=status.HTTP_200_OK)


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

