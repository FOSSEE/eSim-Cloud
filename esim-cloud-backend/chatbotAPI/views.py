"""
chatbotAPI/views.py

GET  /api/chat/health/   →  HealthCheckView  (AllowAny)
POST /api/chat/message/  →  ChatMessageView  (AllowAny)
"""
import logging
import uuid

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from chatbotAPI.throttling import ChatBurstThrottle
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle

from chatbotAPI.serializers import ChatRequestSerializer
from chatbotAPI.services.llm_client import complete_chat, LLMUnavailableError
from chatbotAPI.services.context import sanitize_context

try:
    from chatbotAPI.services.rag import retrieve
    RAG_ENABLED = True
except ImportError:
    RAG_ENABLED = False
    def retrieve(query, k=5): return []

logger = logging.getLogger(__name__)

# Default system prompt — passed to complete_chat, not hardcoded in llm_client
_SYSTEM_PROMPT = "You are eSim Cloud assistant for Indian students. Help with eSim usage and basic circuit questions. If unsure, say so. Context JSON describes their canvas."


class HealthCheckView(APIView):
    """
    Simple health-check endpoint for the chatbot API.
    Returns {"status": "ok"} with HTTP 200.
    Uses AllowAny so it works without authentication.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request, *args, **kwargs):
        return Response({"status": "ok"}, status=200)


class ChatMessageView(APIView):
    """
    POST /api/chat/message/
    Request body  : { "message": "<str>", "conversation_id": "<uuid|null>",
                      "context": { ... } }
    Response body : { "reply": "<str>", "sources": [],
                      "conversation_id": "<uuid>" }
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = [ChatBurstThrottle, UserRateThrottle, AnonRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        message = data["message"]
        conversation_id = data.get("conversation_id") or uuid.uuid4()
        context = data.get("context")
        if context:
            context = sanitize_context(context)
            logger.info(f"Chat context sanitized: {len(str(context))} chars, keys={list(context.keys())}")

        rag_sources = []
        if RAG_ENABLED:
            rag_sources = retrieve(message, k=4)

        system_prompt = _SYSTEM_PROMPT
        if rag_sources:
            doc_context = "\n\n".join([f"Source: {s['title']}\n{s['text']}" for s in rag_sources])
            system_prompt = system_prompt + "\n\nDocumentation context (use this when relevant, cite source titles):\n" + doc_context

        try:
            reply = complete_chat(
                system_prompt=system_prompt,
                user_message=message,
                context_json=context,
            )
        except LLMUnavailableError as e:
            logger.error("[chatbotAPI] Caught LLMUnavailableError: %s", e)
            return Response(
                {"error": "LLM unavailable", "sources": []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.error("[chatbotAPI] Unexpected error in chat endpoint: %s - %s", type(e).__name__, str(e))
            return Response(
                {"error": "An unexpected error occurred", "sources": []},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "reply": reply,
                "sources": [{"title": s["title"], "url": s["url"]} for s in rag_sources],
                "conversation_id": str(conversation_id),
            },
            status=status.HTTP_200_OK,
        )
