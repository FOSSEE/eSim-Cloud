class TokenStrategy:
    @classmethod
    def obtain(cls, user):
        # django.utils.six was removed in Django 3.0; use the Token model directly.
        # Original code had user=... (Ellipsis) which is an unfilled placeholder.
        from rest_framework.authtoken.models import Token
        token, _ = Token.objects.get_or_create(user=user)
        return token
