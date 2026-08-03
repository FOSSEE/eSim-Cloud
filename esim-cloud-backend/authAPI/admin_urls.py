"""URLs for the password-gated operator console mounted at /admin/."""

from django.urls import path

from authAPI import admin_views

urlpatterns = [
    path('', admin_views.admin_panel, name='admin_panel'),
    path('login/', admin_views.admin_login, name='admin_login'),
    path('logout/', admin_views.admin_logout, name='admin_logout'),
    path('setup/', admin_views.admin_setup, name='admin_setup'),
]
