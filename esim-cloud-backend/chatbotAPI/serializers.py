"""
chatbotAPI/serializers.py

Serializers for the chat message endpoint.
"""
import json

from rest_framework import serializers


class ChatRequestSerializer(serializers.Serializer):
    """Validates the incoming POST body for /api/chat/message/."""

    message = serializers.CharField(required=True, max_length=4000)
    conversation_id = serializers.UUIDField(required=False, allow_null=True)
    context = serializers.JSONField(required=False, allow_null=True)

    def validate_message(self, value):
        """Reject empty or whitespace-only messages."""
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError(
                "Message cannot be empty or whitespace-only."
            )
        return stripped

    def validate_context(self, value):
        """Reject context payloads larger than 8 KB when serialised."""
        if value is not None:
            serialised_size = len(json.dumps(value))
            if serialised_size > 8192:
                raise serializers.ValidationError(
                    "Context payload exceeds the 8 KB size limit."
                )
        return value
