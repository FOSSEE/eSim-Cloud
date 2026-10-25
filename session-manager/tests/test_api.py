import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

client = TestClient(app)


@patch('main.get_session', return_value=None)
@patch('main.create_simulation_pod', return_value='sim-user123')
@patch('main.save_session')
def test_start_session_new(mock_save, mock_create, mock_get):
    """Test: naya session start hota hai"""
    response = client.post("/session/start", json={
        "user_id": "user123",
        "namespace": "default"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["pod_name"] == "sim-user123"
    assert data["user_id"] == "user123"


@patch('main.get_session', return_value={
    "pod_name": "sim-user123",
    "namespace": "default",
    "user_id": "user123"
})
@patch('main.get_pod_status', return_value="Running")
def test_start_session_existing(mock_status, mock_get):
    """Test: existing session wapas milti hai"""
    response = client.post("/session/start", json={
        "user_id": "user123",
        "namespace": "default"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Running"


@patch('main.get_session', return_value=None)
def test_get_session_not_found(mock_get):
    """Test: session nahi hai toh 404 milta hai"""
    response = client.get("/session/user999")
    assert response.status_code == 404


@patch('main.get_session', return_value={
    "pod_name": "sim-user123",
    "namespace": "default",
    "user_id": "user123"
})
@patch('main.get_pod_status', return_value="Running")
@patch('main.refresh_session')
def test_get_session_found(mock_refresh, mock_status, mock_get):
    """Test: session milti hai aur timer refresh hota hai"""
    response = client.get("/session/user123")
    assert response.status_code == 200
    assert response.json()["status"] == "Running"
    mock_refresh.assert_called_once_with("user123")


@patch('main.get_session', return_value={
    "pod_name": "sim-user123",
    "namespace": "default",
    "user_id": "user123"
})
@patch('main.delete_simulation_pod')
@patch('main.delete_session')
def test_end_session(mock_del_session, mock_del_pod, mock_get):
    """Test: session end hoti hai aur pod delete hota hai"""
    response = client.delete("/session/user123")
    assert response.status_code == 200
    mock_del_pod.assert_called_once()
    mock_del_session.assert_called_once()


def test_health_check():
    """Test: health endpoint kaam karta hai"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"