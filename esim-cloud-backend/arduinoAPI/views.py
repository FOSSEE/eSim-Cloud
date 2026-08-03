from rest_framework.views import APIView
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from arduinoAPI.tasks import compile_sketch_task
import uuid
from celery.result import AsyncResult


SKETCH_REQUEST_BODY = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    description='Map of Arduino component id to its source code. '
                'One entry per Arduino board on the canvas.',
    additional_properties=openapi.Schema(type=openapi.TYPE_STRING),
    example={'1': 'void setup(){} void loop(){}'},
)

TASK_QUEUED_RESPONSE = openapi.Response(
    'Compilation task queued',
    openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'state': openapi.Schema(
                type=openapi.TYPE_STRING,
                description='Initial Celery task state (usually PENDING)'),
            'uuid': openapi.Schema(
                type=openapi.TYPE_STRING, format='uuid',
                description='Task id — poll /api/arduino/compile/status'
                            '?task_id=<uuid>'),
        }))


class CompileSketchINO(APIView):

    @swagger_auto_schema(
        tags=['Arduino'],
        operation_summary='Compile Arduino sketches (C++/.ino)',
        operation_description=(
            'Queues avr-gcc compilation of one or more Arduino sketches on '
            'a Celery worker. The request body maps each Arduino component '
            'id on the canvas to its sketch source. Poll '
            '`GET /api/arduino/compile/status?task_id=<uuid>`; on '
            '`SUCCESS` the details contain the compiled hex (per Arduino '
            'id) used by the in-browser AVR8 simulator.'),
        request_body=SKETCH_REQUEST_BODY,
        responses={200: TASK_QUEUED_RESPONSE})
    def post(self, request):
        """
        Compile list of Arduino Sketch File

        body: {<Arduino ID>:<source code>}
        example: { "1":"void setup(){}void loop(){}"}
        """
        # Create Task ID (Used for getting Response)
        task_id = uuid.uuid4()
        # Queue Task
        task = compile_sketch_task.apply_async(
            kwargs={
                'data': request.data,
                'task_id': task_id,
                'langIndex': 0
            }, task_id=str(task_id))
        # Return Status
        return Response({
            'state': task.state,
            'uuid': str(task_id)
        })


class CompileSketchInlineAssembly(APIView):

    @swagger_auto_schema(
        tags=['Arduino'],
        operation_summary='Compile Arduino inline-assembly sketches',
        operation_description=(
            'Same as `/api/arduino/compileINO` but the sources are treated '
            'as C with AVR inline assembly (compiled with langIndex 1). '
            'Returns a task uuid to poll on the status endpoint.'),
        request_body=SKETCH_REQUEST_BODY,
        responses={200: TASK_QUEUED_RESPONSE})
    def post(self, request):
        """
        Compile list of Arduino C Inline assembly File

        body: {<Arduino ID>:<source code>}
        example: { "1":"#include <avr/io.h>#include <util/delay.h>"}
        """
        # Create Task ID (Used for getting Response)
        task_id = uuid.uuid4()
        # Queue Task
        task = compile_sketch_task.apply_async(
            kwargs={
                'data': request.data,
                'task_id': task_id,
                'langIndex': 1
            }, task_id=str(task_id))
        # Return Status
        return Response({
            'state': task.state,
            'uuid': str(task_id)
        })


class CompilationStatus(APIView):
    """
    Returns Compilation Status
    """

    @swagger_auto_schema(
        tags=['Arduino'],
        operation_summary='Poll Arduino compilation status',
        operation_description=(
            'Returns the Celery state for a compilation task. On '
            '`SUCCESS`, `details` maps each Arduino id to its compiler '
            'output and Intel-hex binary; on compile errors it carries the '
            'avr-gcc error log. Returns an empty object if `task_id` is '
            'missing.'),
        manual_parameters=[
            openapi.Parameter(
                'task_id', openapi.IN_QUERY, type=openapi.TYPE_STRING,
                format='uuid', required=True,
                description='uuid returned by a compile endpoint'),
        ],
        responses={
            200: openapi.Response(
                'Task state',
                openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        'state': openapi.Schema(type=openapi.TYPE_STRING),
                        'details': openapi.Schema(type=openapi.TYPE_OBJECT),
                    })),
        })
    def get(self, request):
        # GET task id from Query
        task_id = request.GET.get("task_id", -1)
        if task_id == -1:
            return Response({})

        # Get Celery Result
        celery_result = AsyncResult(str(task_id))
        # return Result with status
        response_data = {
            'state': celery_result.state,
            'details': celery_result.info
        }
        return Response(response_data)
