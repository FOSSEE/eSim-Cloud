import asyncio
import httpx
import os
from session_store import get_all_sessions, delete_session
from k8s_client import delete_simulation_pod, get_pod_status, list_simulation_pods

SESSION_MANAGER_URL = os.getenv(
    "SESSION_MANAGER_URL",
    "http://localhost:8001"
)


async def cleanup_idle_sessions():
    """
    Check all active sessions.
    If pod is not Running — delete it and clean up Redis.
    Redis TTL (30 min) handles idle timeout automatically.
    """
    print("Running cleanup check...")
    sessions = get_all_sessions()

    for session in sessions:
        pod_name = session["pod_name"]
        namespace = session["namespace"]
        user_id = session["user_id"]

        status = get_pod_status(pod_name, namespace)

        # Pod failed or not found — clean up
        if status in [None, "Failed", "Succeeded", "Unknown"]:
            print(f"Cleaning up dead pod: {pod_name} for user: {user_id}")
            delete_simulation_pod(pod_name, namespace)
            delete_session(user_id)
            print(f"Cleaned up session for user: {user_id}")

    # NEW: orphaned pods — pod exists in k8s but Redis session already expired
    active_pod_names = {s["pod_name"] for s in sessions}
    all_pod_names = list_simulation_pods()

    for pod_name in all_pod_names:
        if pod_name not in active_pod_names:
            print(f"Cleaning up orphaned pod (no Redis session): {pod_name}")
            delete_simulation_pod(pod_name, "default")



async def run_cleanup_loop():
    """
    Run cleanup every 5 minutes continuously.
    Runs as background task when session manager starts.
    """
    while True:
        try:
            await cleanup_idle_sessions()
        except Exception as e:
            print(f"Cleanup error: {e}")
        # Wait 5 minutes before next cleanup
        await asyncio.sleep(300)


async def force_cleanup_user(user_id: str):
    """
    Immediately clean up a specific user's session.
    Called when user closes browser (disconnect event).
    """
    from session_store import get_session
    session = get_session(user_id)

    if session:
        delete_simulation_pod(
            session["pod_name"],
            session["namespace"]
        )
        delete_session(user_id)
        print(f"Force cleaned session for user: {user_id}")
        return True
    return False