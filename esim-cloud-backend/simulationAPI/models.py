from django.db import models
from django.contrib.postgres.fields import JSONField
from django.core.files.storage import FileSystemStorage
from django.contrib.auth import get_user_model
from django.conf import settings
from django.contrib.auth import get_user_model
import uuid
from saveAPI.models import StateSave


class Task(models.Model):
    # User details for auth to be stored along with task.
    # user = models.ForeignKey(User, on_delete=models.CASCADE)

    task_time = models.DateTimeField(auto_now=True, db_index=True)
    task_id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)

    def save(self, *args, **kwargs):
        super(Task, self).save(*args, **kwargs)


class spiceFile(models.Model):

    file_id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(
        storage=FileSystemStorage(location=settings.MEDIA_ROOT))
    upload_time = models.DateTimeField(auto_now=True, db_index=True)

    # User details for auth to be stored along with task.
    # owner = models.ForeignKey('auth.User')
    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name='file')

    def save(self, *args, **kwargs):
        super(spiceFile, self).save(*args, **kwargs)


class runtimeStat(models.Model):
    """
    Stored number of simulations which fall under and between
    each second and the last. For e.g. if a simulation take 0.5s
    to execute then qty field of the row with with exec_time=1
    will increase by 1 (simulations)
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
    simulation_type = models.CharField(
        max_length=30, null=True, blank=True)
    task = models.ForeignKey(to=Task, on_delete=models.CASCADE)
    simulation_time = models.DateTimeField(auto_now_add=True)
    schematic = models.ForeignKey(
        to=StateSave, on_delete=models.CASCADE, null=True, blank=True)
    owner = models.ForeignKey(
        to=get_user_model(), null=True, on_delete=models.CASCADE)
    netlist = models.TextField()
    result = JSONField(null=True, blank=True)


class SpiceModel(models.Model):
    """
    Stores user-uploaded custom SPICE model definitions (.subckt, .lib, .model).

    Security model:
    - raw_content: original uploaded text, preserved for audit trail
    - sanitized_content: output of spice_model_parser whitelist sanitizer,
      this is the ONLY content that ever gets injected into a netlist
    - is_approved: gates PUBLIC GALLERY publishing only; models are
      immediately usable by their owner for private simulations
    """

    MODEL_TYPES = [
        ('subckt', '.subckt subcircuit definition'),
        ('lib', '.lib library file'),
        ('model', '.model device directive'),
    ]

    id = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        to=get_user_model(), on_delete=models.CASCADE,
        related_name='spice_models')
    name = models.CharField(max_length=100)
    model_type = models.CharField(max_length=10, choices=MODEL_TYPES)
    raw_content = models.TextField(
        help_text='Original uploaded content — never executed directly')
    sanitized_content = models.TextField(
        help_text='Whitelist-sanitized content — injected into netlists')
    is_approved = models.BooleanField(
        default=False,
        help_text='Gates public gallery publishing; personal use is always allowed')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    description = models.TextField(blank=True, default='')
    pin_count = models.IntegerField(null=True, blank=True)
    subckt_name = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Extracted .subckt name for netlist Xref matching')

    class Meta:
        unique_together = ('owner', 'name')
        ordering = ['-created_at']

    def __str__(self):
        return '{} ({})'.format(self.name, self.model_type)
