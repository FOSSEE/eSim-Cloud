"""
chatbotAPI/urls.py

Registers:
  GET  /api/chat/health/   →  HealthCheckView
  POST /api/chat/message/  →  ChatMessageView
"""
from django.urls import path
from .views import HealthCheckView, ChatMessageView

urlpatterns = [
    path('status/', HealthCheckView.as_view(), name='chat-health'),
    path('message/', ChatMessageView.as_view(), name='chat-message'),
]
