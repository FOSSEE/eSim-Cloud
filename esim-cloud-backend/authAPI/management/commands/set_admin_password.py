"""Set or reset the /admin/ panel password from a server shell."""

import getpass
import sys

from django.contrib.auth.password_validation import (
    validate_password, ValidationError)
from django.core.management.base import BaseCommand, CommandError

from authAPI.models import AdminAccess


class Command(BaseCommand):
    help = ('Set the password guarding the /admin/ account console. Also the '
            'recovery path if the password is lost.')

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear', action='store_true',
            help=('Forget the password and return the panel to first-time '
                  'setup with a fresh bootstrap token.'))

    def handle(self, *args, **options):
        access = AdminAccess.load()

        if options['clear']:
            access.password = ''
            access.configured_at = None
            access.failed_attempts = 0
            access.locked_until = None
            access.save()
            token = access.rotate_setup_token()
            self.stdout.write(self.style.SUCCESS(
                'Admin password cleared. /admin/setup/ is open again.'))
            self.stdout.write('Bootstrap token: %s' % token)
            return

        if sys.stdin.isatty():
            password = getpass.getpass('New admin panel password: ')
            confirm = getpass.getpass('Confirm password: ')
        else:
            # Allows `echo "pw" | manage.py set_admin_password` in automation.
            password = sys.stdin.readline().rstrip('\n')
            confirm = password

        if not password:
            raise CommandError('Password cannot be empty.')
        if password != confirm:
            raise CommandError('Passwords do not match.')

        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError(' '.join(exc.messages))

        access.set_password(password)
        # Any live panel session keeps its cookie, so state the obvious.
        self.stdout.write(self.style.SUCCESS(
            'Admin panel password set. Sign in at /admin/.'))
