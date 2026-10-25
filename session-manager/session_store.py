import redis
import json
import os

# Connect to Redis
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)

SESSION_TTL = 1800  # 30 minutes in seconds


def save_session(user_id: str, pod_name: str, namespace: str):
    """
    Save user session info in Redis.
    When user starts simulation — store which pod belongs to them.
    """
    session_data = {
        "pod_name": pod_name,
        "namespace": namespace,
        "user_id": user_id
    }
    redis_client.setex(
        f"session:{user_id}",
        SESSION_TTL,
        json.dumps(session_data)
    )


def get_session(user_id: str):
    """
    Get session info for a user.
    Returns pod details if session exists, None if not found.
    """
    data = redis_client.get(f"session:{user_id}")
    if data:
        return json.loads(data)
    return None


def delete_session(user_id: str):
    """
    Delete session when simulation ends or user closes browser.
    """
    redis_client.delete(f"session:{user_id}")


def get_all_sessions():
    """
    Get all active sessions.
    Used by cleanup service to find idle pods.
    """
    keys = redis_client.keys("session:*")
    sessions = []
    for key in keys:
        data = redis_client.get(key)
        if data:
            sessions.append(json.loads(data))
    return sessions


def refresh_session(user_id: str):
    """
    Reset 30 min timer when user is active.
    Called every time user does something in simulation.
    """
    redis_client.expire(f"session:{user_id}", SESSION_TTL)