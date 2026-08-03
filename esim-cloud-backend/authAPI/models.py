import secrets

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
# Create your models here.


class User(AbstractUser):
    email = models.EmailField(unique=True)


class PendingUser(models.Model):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=128)
    token = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)


class AdminAccess(models.Model):
    """Singleton holding the password that guards the /admin account panel.

    The panel is not tied to a Django user: it is a standalone operator
    console, so it carries its own PBKDF2 hash, its own bootstrap token and
    its own brute-force lockout. Row id is pinned to 1 by `load()`.
    """

    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_SECONDS = 15 * 60
    SESSION_IDLE_SECONDS = 30 * 60

    password = models.CharField(max_length=128, blank=True, default='')
    setup_token = models.CharField(max_length=64, blank=True, default='')
    failed_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    configured_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Admin panel access'
        verbose_name_plural = 'Admin panel access'

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_configured(self):
        return bool(self.password)

    # -- bootstrap ---------------------------------------------------------

    def ensure_setup_token(self):
        """Return the current bootstrap token, minting one if absent.

        Only meaningful before a password exists. The token is the proof of
        server access that gates first-time setup, so it is never rendered
        into a page — it is written to the server log and printed by the
        `admin_setup_token` management command.
        """
        if self.is_configured:
            return ''
        if not self.setup_token:
            self.setup_token = secrets.token_urlsafe(32)
            self.save(update_fields=['setup_token', 'updated_at'])
        return self.setup_token

    def rotate_setup_token(self):
        self.setup_token = secrets.token_urlsafe(32)
        self.save(update_fields=['setup_token', 'updated_at'])
        return self.setup_token

    def check_setup_token(self, raw_token):
        if self.is_configured or not self.setup_token or not raw_token:
            return False
        return secrets.compare_digest(str(self.setup_token), str(raw_token))

    # -- password ----------------------------------------------------------

    def set_password(self, raw_password):
        self.password = make_password(raw_password)
        self.setup_token = ''
        self.failed_attempts = 0
        self.locked_until = None
        self.configured_at = timezone.now()
        self.save()

    def check_password(self, raw_password):
        if not self.is_configured:
            return False
        return check_password(raw_password, self.password)

    # -- lockout -----------------------------------------------------------

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())

    def seconds_until_unlock(self):
        if not self.is_locked:
            return 0
        return int((self.locked_until - timezone.now()).total_seconds())

    def register_failure(self):
        self.failed_attempts += 1
        if self.failed_attempts >= self.MAX_FAILED_ATTEMPTS:
            self.locked_until = timezone.now() + timezone.timedelta(
                seconds=self.LOCKOUT_SECONDS)
            self.failed_attempts = 0
        self.save(update_fields=[
            'failed_attempts', 'locked_until', 'updated_at'])

    def register_success(self):
        self.failed_attempts = 0
        self.locked_until = None
        self.save(update_fields=[
            'failed_attempts', 'locked_until', 'updated_at'])

