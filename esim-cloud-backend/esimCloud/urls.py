"""

esimCloud URL Configuration

"""

from django.contrib import admin
from django.urls import path
from simulationAPI import urls as simulationURLs
from libAPI import urls as libURLs
from saveAPI import urls as saveURLs
from workflowAPI import urls as workURLs
from publishAPI import urls as publishURLs
from authAPI import views as authAPI_views
from authAPI import urls as authURLs
from authAPI import admin_urls as adminPanelURLs
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from django.conf.urls import url, include
from arduinoAPI import urls as arduinoURLs
from ltiAPI import urls as ltiURLS
from simulationAPI import verilog_urls as verilogURLs
from chatbotAPI import urls as chatbotURLs

API_DESCRIPTION = """
REST API for **eSim-Cloud** — a browser based EDA platform for drawing,
simulating and sharing analog/digital circuits and Arduino projects.

## Architecture at a glance

Requests hit an **Nginx** reverse proxy, which routes `/api/*` to this
**Django + DRF** backend. Long running jobs (ngspice, Icarus Verilog, GHDL,
Arduino AVR compilation) are **not** executed inside the request — they are
queued to **Celery** workers through **Redis** and their results are polled by
task id. Persistent data (users, saved schematics, component libraries,
projects, simulation history) lives in **PostgreSQL**.

## Typical simulation flow

1. `POST /api/simulation/upload` (multipart, `file` = SPICE netlist)
   → returns a Celery `task_id`.
2. Poll `GET /api/simulation/status/{task_id}` until `state` is `SUCCESS`
   (`details` then carries the parsed simulation data) or `FAILURE`.

The Verilog (`/api/verilog/*`), HDL (`/api/simulation/hdl/upload`) and Arduino
(`/api/arduino/*`) flows follow the same *upload → poll status* pattern.

## Authentication

Token based (Djoser + DRF TokenAuth):

1. `POST /api/auth/users/` — register (sends an OTP e-mail).
2. `POST /api/auth/users/activation/` — activate with the OTP.
3. `POST /api/auth/token/login/` — obtain `auth_token`.
4. Send it on protected endpoints as the header
   `Authorization: Token <auth_token>`.

Google OAuth2 login is available via `/api/auth/google-callback`.
Endpoints marked with a lock icon in this UI require the token; everything
else is public/anonymous.

## Endpoint groups (tags)

| Tag | Prefix | What it does |
|-----|--------|--------------|
| auth | `/api/auth/` | Register, activate, token login, social auth |
| Simulation (ngspice) | `/api/simulation/` | Netlist/HDL upload, task status, history |
| Verilog HDL | `/api/verilog/` | Multi-file Verilog compile/simulate (iverilog), VCD results |
| Arduino | `/api/arduino/` | Compile Arduino sketches (C++/inline assembly) for AVR |
| save | `/api/save*` | Save/load schematic state, versions, branches, sharing, gallery |
| libraries / components | `/api/libraries` | KiCad component libraries, symbol search |
| publish / tags | `/api/publish/` | Publish circuits as public projects, review flow |
| workflow | `/api/workflow/` | Moderation: roles, project states, reports |
| lti | `/api/lti/` | LMS integration (Moodle etc.) — build LTI apps, grade passback |
| Chatbot | `/api/chat/` | AI assistant for debugging simulation errors |
"""

schema_view = get_schema_view(
    openapi.Info(
        title="eSim Cloud API",
        default_version='v1',
        description=API_DESCRIPTION,
        license=openapi.License(name="GPLv3 License"),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    # Password-gated account console. Independent of every application
    # account: entry requires the panel password alone (see authAPI.models
    # .AdminAccess), bootstrapped once from the server-side setup token.
    path('admin/', include(adminPanelURLs)),

    path('api/admin/', admin.site.urls),

    # Chatbot API Routes
    path('api/chat/', include(chatbotURLs)),

    # Simulation API Routes
    path('api/simulation/', include(simulationURLs)),

    # Verilog/HDL Simulation API Routes
    path('api/verilog/', include(verilogURLs)),

    # libAPI routes
    path('api/', include(libURLs)),

    # libAPI routes
    path('api/', include(saveURLs)),

    # publishAPI routes
    path('api/', include(publishURLs)),

    # workflowAPI routes
    path('api/workflow/', include(workURLs)),

    # Arduino Routes
    path('api/arduino/', include(arduinoURLs)),

    # LTI Routes
    path('api/lti/', include(ltiURLS)),

    # Chatbot Routes
    path('api/chat/', include(chatbotURLs)),

    # Auth API Routes
    path('api/auth/users/', authAPI_views.CustomUserCreateView.as_view()),
    path('api/auth/users/activation/', authAPI_views.CustomUserActivationView.as_view()),
    url(r'^api/auth/', include('djoser.urls')),
    url(r'^api/auth/', include('djoser.urls.authtoken')),
    url(r'^api/auth/', include("djoser.social.urls")),
    url(r'^api/auth/', include(authURLs)),

    # For API Documentation
    url(r'^api/docs(?P<format>\.json|\.yaml)$',
        schema_view.without_ui(
            cache_timeout=0),
        name='schema-json'),

    path('api/docs', schema_view.with_ui(
        'swagger',
        cache_timeout=0),
         name='schema-swagger-ui'),

]
