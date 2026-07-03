"""
esimCloud Simulation API URL Configuration
"""
from django.urls import path
from simulationAPI import views as simulationAPI_views
from simulationAPI.prometheus_metrics import PrometheusMetricsView, PROMETHEUS_AVAILABLE


urlpatterns = [
    # -- Simulation submission --
    path('upload', simulationAPI_views.NetlistUploader.as_view(),
         name='netlistUploader'),

    # -- Job state-machine status (Task 1) --
    path('job/<uuid:job_id>',
         simulationAPI_views.SimulationJobStatusView.as_view(),
         name='simulation_job_status'),

    path('job/<uuid:job_id>/cancel',
         simulationAPI_views.CancelJobView.as_view(),
         name='simulation_job_cancel'),

    # -- Legacy Celery result endpoint (backward compat) --
    path('status/<uuid:task_id>',
         simulationAPI_views.CeleryResultView.as_view(),
         name='celery_status'),

    # -- Simulation history --
    path('history/<uuid:save_id>/<str:version>/<str:branch>/<str:sim>',
         simulationAPI_views.SimulationResults.as_view(),
         name='schematic sim history'),

    path('history/lti/<uuid:save_id>/<str:version>/<str:branch>/<str:sim>',
         simulationAPI_views.SimulationResultsForLTI.as_view(),
         name='schematic sim history for lti'),

    path('history/simulator/<str:sim>',
         simulationAPI_views.SimulationResultsFromSimulator.as_view(),
         name='simulator sim history'),

    path('history/lti/<int:lti_id>',
         simulationAPI_views.GetLTISimResults.as_view(),
         name='lti sim history'),
]

# -- Prometheus metrics endpoint (Task 4) --
if PROMETHEUS_AVAILABLE:
    urlpatterns += [
        path('metrics/', PrometheusMetricsView.as_view(), name='prometheus_metrics'),
    ]
