import pytest
from unittest.mock import patch, MagicMock
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def mock_redis():
    with patch('session_store.redis_client') as mock:
        yield mock


def test_save_session(mock_redis):
    """Test: session save hoti hai Redis mein"""
    from session_store import save_session
    save_session("user123", "sim-user123", "default")
    mock_redis.setex.assert_called_once()


def test_get_session_exists(mock_redis):
    """Test: existing session milti hai"""
    from session_store import get_session
    mock_redis.get.return_value = json.dumps({
        "pod_name": "sim-user123",
        "namespace": "default",
        "user_id": "user123"
    })
    result = get_session("user123")
    assert result["pod_name"] == "sim-user123"
    assert result["user_id"] == "user123"


def test_get_session_not_exists(mock_redis):
    """Test: session nahi hai toh None milta hai"""
    from session_store import get_session
    mock_redis.get.return_value = None
    result = get_session("user999")
    assert result is None


def test_delete_session(mock_redis):
    """Test: session delete hoti hai"""
    from session_store import delete_session
    delete_session("user123")
    mock_redis.delete.assert_called_once_with("session:user123")


def test_refresh_session(mock_redis):
    """Test: session timer reset hota hai"""
    from session_store import refresh_session
    refresh_session("user123")
    mock_redis.expire.assert_called_once_with("session:user123", 1800)