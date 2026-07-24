from rest_framework.throttling import UserRateThrottle, AnonRateThrottle, SimpleRateThrottle

class ChatBurstThrottle(SimpleRateThrottle):
    """
    Limits chat messages to CHAT_THROTTLE_RATE (default 10/minute) per authenticated user
    OR per IP address for anonymous/guest users, since login may not always be available in this project.
    """
    scope = 'chat_burst'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        if user and getattr(user, 'is_authenticated', False):
            ident = user.pk
        else:
            ident = self.get_ident(request)
            
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident
        }
