import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager
from session_store import (
    save_session, get_session,
    delete_session, refresh_session,
    get_all_sessions
)
from k8s_client import (
    create_simulation_pod,
    delete_simulation_pod,
    get_pod_status
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from cleanup import run_cleanup_loop
    task = asyncio.create_task(run_cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="eSim Session Manager", lifespan=lifespan)


class StartSessionRequest(BaseModel):
    user_id: str
    namespace: str = "default"


class SessionResponse(BaseModel):
    user_id: str
    pod_name: str
    namespace: str
    status: str


@app.post("/session/start", response_model=SessionResponse)
async def start_session(request: StartSessionRequest):
    """
    Called by Django when user starts a simulation.
    Creates a new Kubernetes pod for this user.
    """
    existing = get_session(request.user_id)
    if existing:
        status = get_pod_status(
            existing["pod_name"],
            existing["namespace"]
        )
        return SessionResponse(
            user_id=request.user_id,
            pod_name=existing["pod_name"],
            namespace=existing["namespace"],
            status=status or "Unknown"
        )

    pod_name = create_simulation_pod(
        user_id=request.user_id,
        namespace=request.namespace
    )

    save_session(
        user_id=request.user_id,
        pod_name=pod_name,
        namespace=request.namespace
    )

    return SessionResponse(
        user_id=request.user_id,
        pod_name=pod_name,
        namespace=request.namespace,
        status="Creating"
    )


@app.get("/session/{user_id}", response_model=SessionResponse)
async def get_session_status(user_id: str):
    """
    Get current session info for a user.
    """
    session = get_session(user_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="No active session found"
        )

    refresh_session(user_id)

    status = get_pod_status(
        session["pod_name"],
        session["namespace"]
    )

    return SessionResponse(
        user_id=user_id,
        pod_name=session["pod_name"],
        namespace=session["namespace"],
        status=status or "Unknown"
    )


@app.delete("/session/{user_id}")
async def end_session(user_id: str):
    """
    End session when user closes browser.
    """
    session = get_session(user_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="No active session found"
        )

    delete_simulation_pod(
        pod_name=session["pod_name"],
        namespace=session["namespace"]
    )

    delete_session(user_id)

    return {"message": f"Session ended for user {user_id}"}


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    """
    return {"status": "healthy"}


@app.get("/sessions/all")
async def list_all_sessions():
    """
    List all active sessions.
    """
    sessions = get_all_sessions()
    return {"active_sessions": len(sessions), "sessions": sessions}