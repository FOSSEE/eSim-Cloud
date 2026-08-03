"""
URL Configuration for Verilog simulation API endpoints.
"""
from django.urls import path
from simulationAPI import verilog_views

urlpatterns = [
    path('upload', verilog_views.VerilogUploader.as_view(),
         name='verilog_uploader'),

    path('status/<uuid:task_id>',
         verilog_views.VerilogResult.as_view(),
         name='verilog_status'),
]
