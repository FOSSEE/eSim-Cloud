import logging
from rest_framework import serializers
from simulationAPI.models import spiceFile, Task, simulation, SimulationJob
from saveAPI.serializers import SaveListSerializer

logger = logging.getLogger(__name__)


class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = spiceFile
        fields = ('file', 'upload_time', 'file_id', 'task')


class TaskSerializer(serializers.HyperlinkedModelSerializer):
    file = FileSerializer(many=True, read_only=True)

    class Meta:
        model = Task
        fields = ('task_id', 'task_time', 'file')

    def create(self, validated_data):
        files_data = list(self.context.get('view').request.FILES.getlist("file"))[0]
        logger.info('File Upload')
        task = Task.objects.create()
        logger.info('task: ' + str(task))
        spiceFile.objects.create(task=task, file=files_data)
        logger.info('Created Object for:' + files_data.name)
        return task


class simulationSerializer(serializers.ModelSerializer):
    schematic = SaveListSerializer(many=False)

    class Meta:
        model = simulation
        fields = '__all__'


class simulationSaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = simulation
        fields = '__all__'


class SimulationJobSerializer(serializers.ModelSerializer):
    """
    Full serializer for the SimulationJob state-machine model.
    Used by SimulationJobStatusView and the admin.
    """
    duration_seconds = serializers.ReadOnlyField()
    is_terminal = serializers.ReadOnlyField()

    class Meta:
        model = SimulationJob
        fields = [
            'job_id', 'idempotency_key', 'owner', 'session_id',
            'status', 'simulation_type',
            'attempts', 'max_attempts', 'next_retry_at', 'is_retryable_failure',
            'created_at', 'dispatched_at', 'started_at', 'finished_at',
            'last_heartbeat_at',
            'queue_wait_timeout', 'pod_provision_timeout', 'execution_timeout',
            'error_code', 'error_message', 'error_history',
            'result',
            'celery_task_id',
            'duration_seconds', 'is_terminal',
        ]
        read_only_fields = [
            'job_id', 'created_at', 'dispatched_at', 'started_at',
            'finished_at', 'last_heartbeat_at', 'duration_seconds', 'is_terminal',
        ]
