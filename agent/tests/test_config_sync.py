# agent/tests/test_config_sync.py
import pytest
from unittest.mock import MagicMock
from agent.config_sync import ConfigSync
from agent.models import AgentConfig, Camera

FAKE_RESPONSE = {
    "agent_id": "uuid-123",
    "name": "Pi Eduardo",
    "cameras": [
        {"id": "cam-1", "ip": "192.168.1.10", "user": "admin", "pass": "1234",
         "role": "counting", "name": "Entrada", "line_y": 0.5, "rtsp_path": "/stream1"}
    ],
    "thresholds": {"r01_min_people": 5},
    "heartbeat_interval": 300,
    "webhook_token": "wh-tok",
    "supabase_url": "https://x.supabase.co",
    "config_changed_at": "2026-05-05T10:00:00Z",
    "config_updated": False,
}

def test_fetch_config_success(mocker):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = FAKE_RESPONSE
    mock_response.raise_for_status = MagicMock()

    mocker.patch("httpx.get", return_value=mock_response)

    sync = ConfigSync(token="my-token", supabase_url="https://x.supabase.co")
    config = sync.fetch()

    assert isinstance(config, AgentConfig)
    assert config.agent_id == "uuid-123"
    assert len(config.cameras) == 1
    assert config.cameras[0].rtsp_url == "rtsp://admin:1234@192.168.1.10/stream1"
    assert config.config_changed_at == "2026-05-05T10:00:00Z"

def test_fetch_sends_apikey_and_authorization_headers(mocker):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = FAKE_RESPONSE
    mock_response.raise_for_status = MagicMock()

    mock_get = mocker.patch("httpx.get", return_value=mock_response)

    sync = ConfigSync(token="my-token", supabase_url="https://x.supabase.co",
                      anon_key="anon-key-xyz")
    sync.fetch()

    _, kwargs = mock_get.call_args
    headers = kwargs["headers"]
    assert headers["apikey"] == "anon-key-xyz"
    assert headers["Authorization"] == "Bearer my-token"

def test_fetch_config_invalid_token(mocker):
    import httpx
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401", request=MagicMock(), response=mock_response
    )
    mocker.patch("httpx.get", return_value=mock_response)

    sync = ConfigSync(token="bad-token", supabase_url="https://x.supabase.co")
    with pytest.raises(Exception):
        sync.fetch()
