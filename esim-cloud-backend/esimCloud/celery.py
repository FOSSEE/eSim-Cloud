import os
from celery import Celery
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'esimCloud.settings')

app = Celery('esimCloud')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks(lambda: settings.INSTALLED_APPS)

app.conf.beat_schedule = {
    'sweep-failed-grade-passbacks': {
        'task': 'ltiAPI.tasks.sweep_failed_passbacks',
        'schedule': 3600.0,
    },
}


@app.task(bind=True)
def debug_task(self):
    print('Request: {0!r}'.format(self.request))
