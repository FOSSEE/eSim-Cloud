"""Password-gated operator console for user administration.

Reachable only at `/admin/`. Access is guarded by a single panel password
stored as a PBKDF2 hash in `AdminAccess` — it is deliberately independent of
the normal user table so that no application account, however privileged,
grants entry here.

First-time setup requires the bootstrap token, which is only ever emitted to
the server log or the `admin_setup_token` management command; possessing it
means possessing server access. Once a password is set the token is destroyed
and `/admin/setup/` stops responding for good.
"""

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import (
    validate_password, ValidationError)
from django.http import Http404
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from authAPI.models import AdminAccess, PendingUser

logger = logging.getLogger(__name__)

SESSION_FLAG = 'esim_admin_authenticated'
SESSION_SEEN_AT = 'esim_admin_last_seen'


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


def _start_session(request):
    request.session.cycle_key()
    request.session[SESSION_FLAG] = True
    request.session[SESSION_SEEN_AT] = timezone.now().isoformat()


def _end_session(request):
    request.session.pop(SESSION_FLAG, None)
    request.session.pop(SESSION_SEEN_AT, None)


def _session_is_live(request):
    """True only for an unexpired panel session; expires it otherwise."""
    if not request.session.get(SESSION_FLAG):
        return False

    seen_at = request.session.get(SESSION_SEEN_AT)
    if not seen_at:
        _end_session(request)
        return False

    try:
        last_seen = timezone.datetime.fromisoformat(seen_at)
    except ValueError:
        _end_session(request)
        return False

    idle = (timezone.now() - last_seen).total_seconds()
    if idle > AdminAccess.SESSION_IDLE_SECONDS:
        _end_session(request)
        return False

    request.session[SESSION_SEEN_AT] = timezone.now().isoformat()
    return True


@never_cache
@csrf_protect
@require_http_methods(['GET', 'POST'])
def admin_setup(request):
    """One-shot bootstrap: exchange the server-side token for a password."""
    access = AdminAccess.load()
    if access.is_configured:
        # Nothing to bootstrap any more, and no hint that this ever existed.
        raise Http404

    token = access.ensure_setup_token()
    logger.warning(
        'eSim admin panel is not configured. Complete setup at /admin/setup/ '
        'with bootstrap token: %s', token)

    error = None
    if request.method == 'POST':
        if access.is_locked:
            error = ('Too many failed attempts. Try again in %d minute(s).'
                     % max(1, access.seconds_until_unlock() // 60))
        elif not access.check_setup_token(request.POST.get('setup_token', '')):
            access.register_failure()
            logger.warning(
                'Rejected /admin/setup/ attempt with bad bootstrap token '
                'from %s', _client_ip(request))
            error = 'Invalid bootstrap token.'
        else:
            password = request.POST.get('password', '')
            confirm = request.POST.get('confirm_password', '')
            if password != confirm:
                error = 'Passwords do not match.'
            else:
                try:
                    validate_password(password)
                except ValidationError as exc:
                    error = ' '.join(exc.messages)
                else:
                    access.set_password(password)
                    logger.warning(
                        'eSim admin panel password set from %s',
                        _client_ip(request))
                    _start_session(request)
                    return redirect('admin_panel')

    return render(request, 'admin_setup.html', {'error': error})


@never_cache
@csrf_protect
@require_http_methods(['GET', 'POST'])
def admin_login(request):
    access = AdminAccess.load()
    if not access.is_configured:
        return redirect('admin_setup')
    if _session_is_live(request):
        return redirect('admin_panel')

    error = None
    if request.method == 'POST':
        if access.is_locked:
            error = ('Too many failed attempts. Try again in %d minute(s).'
                     % max(1, access.seconds_until_unlock() // 60))
        elif access.check_password(request.POST.get('password', '')):
            access.register_success()
            _start_session(request)
            return redirect('admin_panel')
        else:
            access.register_failure()
            logger.warning(
                'Failed /admin/ login attempt from %s', _client_ip(request))
            error = 'Incorrect password.'

    return render(request, 'admin_login.html', {'error': error})


@never_cache
@require_http_methods(['GET', 'POST'])
def admin_logout(request):
    _end_session(request)
    return redirect('admin_login')


@never_cache
@csrf_protect
@require_http_methods(['GET', 'POST'])
def admin_panel(request):
    """The account console itself. Every entry path lands on the gate first."""
    access = AdminAccess.load()
    if not access.is_configured:
        return redirect('admin_setup')
    if not _session_is_live(request):
        return redirect('admin_login')

    User = get_user_model()

    if request.method == 'POST':
        action = request.POST.get('action')
        user_id = request.POST.get('user_id')
        pending_id = request.POST.get('pending_id')

        if action == 'delete_user' and user_id:
            User.objects.filter(id=user_id).delete()
        elif action == 'delete_pending' and pending_id:
            PendingUser.objects.filter(id=pending_id).delete()
        elif action == 'activate_pending' and pending_id:
            try:
                pending = PendingUser.objects.get(id=pending_id)
                # Guard against IntegrityError if the account got created
                # through the normal OTP flow in the meantime.
                if not User.objects.filter(
                        username=pending.username).exists() and \
                        not User.objects.filter(
                            email=pending.email).exists():
                    User.objects.create(
                        username=pending.username,
                        email=pending.email,
                        password=pending.password,
                        is_active=True
                    )
                pending.delete()
            except PendingUser.DoesNotExist:
                pass
        elif action == 'create_user':
            username = request.POST.get('username')
            email = request.POST.get('email')
            password = request.POST.get('password')
            if username and email and password:
                from django.contrib.auth.hashers import make_password
                if not User.objects.filter(username=username).exists() and \
                        not User.objects.filter(email=email).exists():
                    User.objects.create(
                        username=username,
                        email=email,
                        password=make_password(password),
                        is_active=True
                    )
        # POST/redirect/GET so a refresh cannot replay a destructive action.
        return redirect('admin_panel')

    return render(request, 'account_dashboard.html', {
        'users': User.objects.all().order_by('-date_joined'),
        'pending_users': PendingUser.objects.all().order_by('-created_at')
    })
