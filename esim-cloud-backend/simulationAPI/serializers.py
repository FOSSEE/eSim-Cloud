import logging
from rest_framework import serializers
from simulationAPI.models import spiceFile, Task, simulation, SpiceModel
from saveAPI.serializers import SaveListSerializer
from simulationAPI.helpers.spice_model_parser import sanitize_spice_model

logger = logging.getLogger(__name__)

# Max upload size: 512KB (524288 bytes)
SPICE_MODEL_MAX_BYTES = 512 * 1024


class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = spiceFile
        fields = ('file', 'upload_time', 'file_id', 'task')


class TaskSerializer(serializers.HyperlinkedModelSerializer):
    # user = serializers.ReadOnlyField(source='user.username')
    file = FileSerializer(many=True, read_only=True)

    class Meta:
        model = Task
        fields = ('task_id', 'task_time', 'file')

    def create(self, validated_data):
        # Takes file from request and stores it along with a taskid
        files_data = list(self.context.get(
            'view').request.FILES.getlist("file"))[0]
        logger.info('File Upload')
        task = Task.objects.create()
        logger.info('task: '+str(task))
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


# =========================================================================
# Custom SPICE Model Serializers (Issue #539)
# =========================================================================

class SpiceModelSerializer(serializers.ModelSerializer):
    """Read serializer for list/detail views. Does NOT expose raw/sanitized
    content in list responses to minimize payload size."""

    class Meta:
        model = SpiceModel
        fields = [
            'id', 'name', 'model_type', 'subckt_name', 'pin_count',
            'is_approved', 'created_at', 'updated_at', 'description',
        ]
        read_only_fields = fields


class SpiceModelDetailSerializer(serializers.ModelSerializer):
    """Detail serializer that includes sanitized_content for owner views."""

    class Meta:
        model = SpiceModel
        fields = [
            'id', 'name', 'model_type', 'subckt_name', 'pin_count',
            'is_approved', 'created_at', 'updated_at', 'description',
            'sanitized_content',
        ]
        read_only_fields = fields


class SpiceModelUploadSerializer(serializers.Serializer):
    """
    Write serializer for model uploads. Enforces:
    - 512KB max file size
    - Whitelist sanitization via spice_model_parser
    - Metadata extraction (subckt_name, pin_count)

    On successful validation, `validated_data` will contain computed fields
    ready for SpiceModel.objects.create().
    """

    file = serializers.FileField(
        help_text='SPICE model file (.subckt, .lib, .model)')
    name = serializers.CharField(
        max_length=100,
        help_text='Human-readable name, e.g. "SCD41_Sensor"')
    model_type = serializers.ChoiceField(
        choices=['subckt', 'lib', 'model'],
        help_text='Type of SPICE definition in the file')
    description = serializers.CharField(
        required=False, default='', allow_blank=True,
        help_text='Optional description of the model')

    def validate_file(self, uploaded_file):
        """Enforce 512KB size limit and read file content."""
        if uploaded_file.size > SPICE_MODEL_MAX_BYTES:
            raise serializers.ValidationError(
                'File size {} bytes exceeds maximum allowed '
                '{} bytes (512KB).'.format(
                    uploaded_file.size, SPICE_MODEL_MAX_BYTES)
            )
        # Read and decode the file content
        try:
            raw_content = uploaded_file.read().decode('utf-8')
        except UnicodeDecodeError:
            raise serializers.ValidationError(
                'File must be a valid UTF-8 text file.'
            )
        return raw_content

    def validate(self, attrs):
        """Run the whitelist sanitizer on the file content."""
        raw_content = attrs['file']  # already read by validate_file

        sanitize_result = sanitize_spice_model(raw_content)

        if not sanitize_result.is_valid:
            raise serializers.ValidationError({
                'file': sanitize_result.errors,
                'validation': sanitize_result.to_dict(),
            })

        # Store computed fields for the view to use when creating the model
        attrs['raw_content'] = raw_content
        attrs['sanitized_content'] = sanitize_result.sanitized_content
        attrs['subckt_name'] = sanitize_result.metadata.get(
            'subckt_name', '')
        attrs['pin_count'] = sanitize_result.metadata.get('pin_count', 0)
        attrs['_validation_result'] = sanitize_result.to_dict()

        # Remove the file field — we've extracted what we need
        del attrs['file']

        return attrs

