import requests
import logging

logger = logging.getLogger(__name__)

def notify_session_manager(user_id: str):
    """
    Notify session manager to create a Kubernetes pod for this user.
    Called when user starts a simulation.
    """
    try:
        requests.post(
            'http://host.docker.internal:8001/session/start',
            json={'user_id': user_id},
            timeout=5
        )
        logger.info(f"Session created for user {user_id}")
    except Exception as e:
        logger.warning(f"Session manager unavailable: {e}")