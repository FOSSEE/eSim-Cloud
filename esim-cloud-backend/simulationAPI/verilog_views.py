"""
API Views for Verilog simulation.
"""

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from celery.result import AsyncResult
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from simulationAPI.verilog_tasks import verilog_simulate_task
import uuid
import logging

logger = logging.getLogger(__name__)

HDL_FILE_SCHEMA = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=['filename', 'content'],
    properties={
        'filename': openapi.Schema(type=openapi.TYPE_STRING,
                                   example='alu.v'),
        'content': openapi.Schema(type=openapi.TYPE_STRING,
                                  example='module alu(...); endmodule'),
    })


class VerilogUploader(APIView):
    """
    POST endpoint to submit Verilog source files for simulation.

    Expects JSON body:
    {
        "sources": [
            {"filename": "alu.v", "content": "module alu..."},
            ...
        ],
        "testbench": {
            "filename": "tb_alu.v",
            "content": "module tb_alu..."
        },
        "mode": "simulate"  // or "syntax_check"
    }
    """
    permission_classes = (AllowAny,)

    @swagger_auto_schema(
        tags=['Verilog HDL'],
        operation_summary='Compile / simulate a multi-file Verilog design',
        operation_description=(
            'Backs the `/simulator/hdl` IDE. Accepts design sources plus a '
            'mandatory testbench as inline JSON (no file upload), queues an '
            '**Icarus Verilog** run on Celery and returns a `task_id` to '
            'poll at `GET /api/verilog/status/{task_id}`.\n\n'
            '`mode=syntax_check` only compiles; `mode=simulate` also runs '
            'vvp and returns parsed VCD waveform data.'),
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['testbench'],
            properties={
                'sources': openapi.Schema(
                    type=openapi.TYPE_ARRAY, items=HDL_FILE_SCHEMA,
                    description='Design files (may be empty if the '
                                'testbench is self-contained)'),
                'testbench': HDL_FILE_SCHEMA,
                'mode': openapi.Schema(
                    type=openapi.TYPE_STRING,
                    enum=['simulate', 'syntax_check'], default='simulate'),
                'compiler': openapi.Schema(
                    type=openapi.TYPE_STRING, default='iverilog',
                    description='HDL compiler backend'),
            }),
        responses={
            200: openapi.Response(
                'Task queued',
                openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        'state': openapi.Schema(type=openapi.TYPE_STRING),
                        'task_id': openapi.Schema(type=openapi.TYPE_STRING,
                                                  format='uuid'),
                        'mode': openapi.Schema(type=openapi.TYPE_STRING),
                    })),
            400: 'Missing testbench or malformed source entry',
        })
    def post(self, request, *args, **kwargs):
        logger.info('Verilog upload request received')

        sources = request.data.get('sources', [])
        testbench = request.data.get('testbench', None)
        mode = request.data.get('mode', 'simulate')
        compiler = request.data.get('compiler', 'iverilog')

        # Validate inputs
        if not sources and not testbench:
            return Response(
                {'error': 'At least one source file or testbench is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not testbench:
            return Response(
                {'error': 'A testbench file is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not testbench.get('filename') or not testbench.get('content'):
            return Response(
                {'error': 'Testbench must have a filename and content.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate source files
        for src in sources:
            if not src.get('filename') or not src.get('content'):
                return Response(
                    {'error': 'Each source file must have a filename and content.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Validate mode
        if mode not in ('simulate', 'syntax_check'):
            mode = 'simulate'

        # Generate a unique task ID
        task_id = str(uuid.uuid4())

        # Dispatch Celery task
        celery_task = verilog_simulate_task.apply_async(
            kwargs={
                'task_id': task_id,
                'sources': sources,
                'testbench': testbench,
                'mode': mode,
                'compiler': compiler
            },
            task_id=task_id
        )

        response_data = {
            'state': celery_task.state,
            'task_id': task_id,
            'mode': mode
        }
        return Response(response_data, status=status.HTTP_200_OK)


class VerilogResult(APIView):
    """
    GET endpoint to poll for Verilog simulation results.
    /api/verilog/status/<uuid>
    """
    permission_classes = (AllowAny,)

    @swagger_auto_schema(
        tags=['Verilog HDL'],
        operation_summary='Poll Verilog task status / fetch results',
        operation_description=(
            'Returns Celery state for a Verilog task. On `SUCCESS`, '
            '`details` carries compiler output plus (in simulate mode) '
            'parsed VCD signal data for the waveform viewer; on failure it '
            'carries the compiler error log.'),
        responses={
            200: openapi.Response(
                'Task state',
                openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        'state': openapi.Schema(type=openapi.TYPE_STRING),
                        'details': openapi.Schema(type=openapi.TYPE_OBJECT),
                    })),
            400: 'Invalid UUID format',
        })
    def get(self, request, task_id):
        try:
            task_uuid = uuid.UUID(str(task_id))
        except ValueError:
            return Response(
                {'error': 'Invalid UUID format'},
                status=status.HTTP_400_BAD_REQUEST
            )

        celery_result = AsyncResult(str(task_uuid))
        info = celery_result.info
        if isinstance(info, Exception):
            info = str(info)
            
        response_data = {
            'state': celery_result.state,
            'details': info
        }
        return Response(response_data, status=status.HTTP_200_OK)
