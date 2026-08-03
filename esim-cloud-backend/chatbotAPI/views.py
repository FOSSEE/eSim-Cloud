# OLLAMA SETUP (run on your host machine, not in Docker):
# 1. Download Ollama from https://ollama.ai
# 2. Run: ollama pull llama3.2
# 3. Ollama starts automatically and listens on port 11434
# 4. No API key needed — completely free and local
# 5. To use a different model: set env var OLLAMA_MODEL=mistral or OLLAMA_MODEL=llama3

"""
chatbotAPI/views.py

POST /api/chat/message/
Request body  : { "message": "<str>", "context": { "page": "<str>" } }
Response body : { "reply": "<str>" }

GET /api/chat/status/
Response body : { "ollama": true/false, "gemini": true/false, "active_backend": "ollama"|"gemini"|"fallback" }
"""
import os
import logging
import requests as http_requests
from django.conf import settings

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

logger = logging.getLogger(__name__)

# ── Gemini REST endpoint ─────────────────────────────────────────────────────
_GEMINI_URL = (
    'https://generativelanguage.googleapis.com/v1beta/models/'
    'gemini-2.0-flash:generateContent'
)
_SYSTEM_PROMPT = (
    'You are an AI assistant embedded in eSim-Cloud, an online circuit simulator '
    'built on ngspice.  Help users debug their SPICE netlists, explain simulation '
    'errors, and suggest fixes.  Keep answers concise and practical.  If the user '
    'pastes an error message, identify the root cause and give a numbered list of '
    'steps to fix it.  Use plain text — no markdown bold or bullet symbols.'
)

def try_ollama(message: str):
    ollama_host = os.environ.get('OLLAMA_HOST', 'host.docker.internal')
    ollama_model = os.environ.get('OLLAMA_MODEL', 'llama3.2')
    ollama_url = f'http://{ollama_host}:11434/api/generate'
    full_prompt = f"You are the eSim-Cloud AI assistant helping with ngspice circuit simulation errors. The user says: {message}. Answer in 2-3 sentences with practical advice."

    try:
        resp = http_requests.post(
            ollama_url,
            json={
                "model": ollama_model,
                "prompt": full_prompt,
                "stream": False
            },
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        reply = data.get('response', '').strip()
        if reply:
            logger.info('[chatbotAPI] Ollama reply generated successfully')
            return reply
    except Exception as exc:
        logger.warning('[chatbotAPI] Ollama unavailable: %s', exc)
        return None
    return None

def try_gemini(message: str):
    print('[ChatAPI] Calling Gemini API for user message:', message[:50])
    api_key = getattr(settings, 'GEMINI_API_KEY', '').strip()
    if not api_key:
        return None

    payload = {
        'system_instruction': {
            'parts': [{'text': _SYSTEM_PROMPT}]
        },
        'contents': [
            {'role': 'user', 'parts': [{'text': message}]}
        ],
        'generationConfig': {
            'temperature': 0.4,
            'maxOutputTokens': 512,
        }
    }

    try:
        resp = http_requests.post(
            _GEMINI_URL,
            params={'key': api_key},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        reply = (
            data.get('candidates', [{}])[0]
            .get('content', {})
            .get('parts', [{}])[0]
            .get('text', '')
            .strip()
        )
        if reply:
            logger.info('[chatbotAPI] Gemini reply generated successfully')
            return reply
    except Exception as exc:
        logger.warning('[chatbotAPI] Gemini unavailable (%s)', exc)
        return None
    return None

# ── Rule-based fallback ──────────────────────────────────────────────────────

_RULES = [
    (
        ['floating node', 'node is floating'],
        'A floating node means a pin is not connected to anything.  '
        'Connect all unconnected pins to a wire, ground (GND), or add a large '
        'pull-down resistor (e.g. 1 GΩ) to ground to fix the issue.'
    ),
    (
        ['no ground', 'no dc path to ground', 'node 0'],
        'Every ngspice circuit needs at least one GND (node 0) connection.  '
        'Add a ground symbol to your schematic and connect it to the reference node.'
    ),
    (
        ['singular matrix', 'matrix singular'],
        'A singular matrix usually means two voltage sources are shorted together '
        'or there is a loop of ideal voltage sources.  Add a small series resistance '
        '(e.g. 1 mΩ) to break the loop.'
    ),
    (
        ['timestep too small', 'time step', 'internal timestep'],
        'The simulator could not converge.  Try: (1) Increase .tran step size, '
        '(2) Add .options reltol=0.01, (3) Check for very fast switching signals '
        'or parasitic loops in your schematic.'
    ),
    (
        ['no .plot', 'no simulations run', 'no simulation'],
        'Your netlist has no simulation command.  Add one of: .tran <step> <stop>, '
        '.ac <type> <points> <start> <stop>, or .dc <source> <start> <stop> <step>.  '
        'Also add a .print or .probe directive to capture output.'
    ),
    (
        ['mal formed b line', 'malformed b line'],
        'A B-source (arbitrary voltage/current source) has invalid syntax.  '
        'Check the expression in the source properties — it must be a valid '
        'ngspice expression such as V=sin(2*pi*1k*time).'
    ),
    (
        ['unknown subcircuit', 'could not find subcircuit'],
        'ngspice cannot find the subcircuit (model) definition.  Make sure the '
        '.lib or .model file for this component is included with a .include or '
        '.lib directive at the top of your netlist.'
    ),
    (
        ['device not found', 'unknown device type'],
        'An unknown device type was used.  Check the component reference letter '
        '(R for resistor, C for capacitor, L for inductor, Q for BJT, M for MOSFET) '
        'and ensure any custom models are included.'
    ),
    (
        ['fatal error', 'exit(1)'],
        'ngspice encountered a fatal error.  Check the Technical Details section '
        'for the specific ERROR: line.  Common causes: missing model files, '
        'syntax errors in .subckt definitions, or unsupported analysis types.'
    ),
    (
        ['component model not found', "can't find model", 'could not find a valid modelname'],
        'The simulation failed because a component uses a model name (e.g., BC546B) that is not installed '
        'in ngspice. You must either provide a .model or .lib definition in your netlist for this component, '
        'or use a generic component from the DEFAULT library.'
    ),
]


def get_rule_based_reply(message: str) -> str:
    lower = message.lower()
    for keywords, reply in _RULES:
        if any(kw in lower for kw in keywords):
            return reply
    return (
        'I am the eSim-Cloud AI assistant.  To give you a specific answer, please '
        'paste the exact error message from the simulation output.  Common things to '
        'check: all nodes are connected, a ground symbol is present, all component '
        'models are defined, and a simulation analysis command (.tran/.ac/.dc) exists '
        'in your netlist.'
    )


# ── View ─────────────────────────────────────────────────────────────────────

class ChatMessageView(APIView):
    """
    POST /api/chat/message/
    """
    permission_classes = (AllowAny,)

    @swagger_auto_schema(
        tags=['Chatbot'],
        operation_summary='Ask the AI assistant a question',
        operation_description=(
            'Sends a user message to the embedded circuit-debugging '
            'assistant. Backend priority: local **Ollama** (if reachable) '
            '→ **Gemini** (if `GEMINI_API_KEY` configured) → rule-based '
            'keyword matcher for common ngspice errors (floating node, '
            'singular matrix, missing ground, ...). Always returns 200 '
            'with a `reply` — the fallback never fails.'),
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['message'],
            properties={
                'message': openapi.Schema(
                    type=openapi.TYPE_STRING,
                    example='ngspice says: singular matrix'),
                'context': openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    description='Optional UI context',
                    properties={
                        'page': openapi.Schema(
                            type=openapi.TYPE_STRING,
                            example='schematic-editor'),
                    }),
            }),
        responses={
            200: openapi.Response(
                'Assistant reply',
                openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={'reply': openapi.Schema(
                        type=openapi.TYPE_STRING)})),
            400: 'message field is required',
        })
    def post(self, request, *args, **kwargs):
        message = (request.data.get('message') or '').strip()
        context = request.data.get('context') or {}

        if not message:
            return Response(
                {'error': 'message field is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        page = context.get('page', '')
        user_content = message
        if page:
            user_content = f'[Page: {page}] {message}'

        reply = try_ollama(user_content)
        if reply is None:
            reply = try_gemini(user_content)
        
        if reply is None:
            reply = get_rule_based_reply(message)

        return Response({'reply': reply}, status=status.HTTP_200_OK)


class ChatStatusView(APIView):
    """
    GET /api/chat/status/
    """
    permission_classes = (AllowAny,)

    @swagger_auto_schema(
        tags=['Chatbot'],
        operation_summary='Check which chatbot backend is active',
        operation_description=(
            'Probes Ollama reachability and Gemini key presence. '
            '`active_backend` is `ollama`, `gemini` or `fallback` '
            '(rule-based).'),
        responses={
            200: openapi.Response(
                'Backend availability',
                openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        'ollama': openapi.Schema(
                            type=openapi.TYPE_BOOLEAN),
                        'gemini': openapi.Schema(
                            type=openapi.TYPE_BOOLEAN),
                        'active_backend': openapi.Schema(
                            type=openapi.TYPE_STRING,
                            enum=['ollama', 'gemini', 'fallback']),
                    }))
        })
    def get(self, request, *args, **kwargs):
        ollama_host = os.environ.get('OLLAMA_HOST', 'host.docker.internal')
        ollama_reachable = False
        try:
            resp = http_requests.get(f'http://{ollama_host}:11434/api/tags', timeout=3)
            if resp.status_code == 200:
                ollama_reachable = True
        except Exception:
            pass
        
        api_key = getattr(settings, 'GEMINI_API_KEY', '').strip()
        gemini_configured = bool(api_key)

        active = 'fallback'
        if ollama_reachable:
            active = 'ollama'
        elif gemini_configured:
            active = 'gemini'

        return Response({
            'ollama': ollama_reachable,
            'gemini': gemini_configured,
            'active_backend': active
        }, status=status.HTTP_200_OK)
