"""Print (or rotate) the bootstrap token for first-time /admin/ setup."""

from django.core.management.base import BaseCommand

from authAPI.models import AdminAccess


class Command(BaseCommand):
    help = ('Show the one-time bootstrap token used to set the /admin/ panel '
            'password. Requires shell access to the server by design.')

    def add_arguments(self, parser):
        parser.add_argument(
            '--rotate', action='store_true',
            help='Discard the current token and mint a new one.')

    def handle(self, *args, **options):
        access = AdminAccess.load()

        if access.is_configured:
            self.stdout.write(self.style.WARNING(
                'The admin panel password is already set, so no bootstrap '
                'token exists.'))
            self.stdout.write(
                'Run "python manage.py set_admin_password" to change it.')
            return

        token = (access.rotate_setup_token() if options['rotate']
                 else access.ensure_setup_token())

        self.stdout.write(self.style.SUCCESS('Admin bootstrap token:'))
        self.stdout.write('')
        self.stdout.write('    %s' % token)
        self.stdout.write('')
        self.stdout.write(
            'Enter it at /admin/setup/ to choose the panel password. '
            'It stops working the moment setup completes.')
