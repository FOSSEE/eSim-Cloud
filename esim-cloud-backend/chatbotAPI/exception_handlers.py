from rest_framework.views import exception_handler
from rest_framework.exceptions import Throttled

def custom_throttle_exception_handler(exc, context):
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)

    # Now add the custom error message if it's a throttle exception
    if response is not None and isinstance(exc, Throttled):
        response.data = {"detail": "Rate limit exceeded. Try again later."}

    return response
