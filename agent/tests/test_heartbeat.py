# agent/tests/test_heartbeat.py
import datetime, pytest
from unittest.mock import MagicMock
from agent.heartbeat import HeartbeatSender

def test_send_heartbeat_success(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "config_updated": False}
    mock_resp.raise_for_status = MagicMock()
    mocker.patch("httpx.post", return_value=mock_resp)

    sender = HeartbeatSender(
        token="tok",
        supabase_url="https://x.supabase.co",
        version="0.1.0",
        last_config_changed_at="2026-05-05T10:00:00Z",
    )
    result = sender.send(cameras_online=2, last_inference=datetime.datetime.utcnow())

    assert result["config_updated"] is False
    import httpx
    httpx.post.assert_called_once()

def test_send_heartbeat_returns_config_updated(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "config_updated": True}
    mock_resp.raise_for_status = MagicMock()
    mocker.patch("httpx.post", return_value=mock_resp)

    sender = HeartbeatSender(token="tok", supabase_url="https://x.supabase.co",
                             version="0.1.0", last_config_changed_at="")
    result = sender.send(cameras_online=1, last_inference=None)
    assert result["config_updated"] is True

def test_send_heartbeat_silent_on_error(mocker):
    import httpx
    mocker.patch("httpx.post", side_effect=httpx.ConnectError("timeout"))

    sender = HeartbeatSender(token="tok", supabase_url="https://x.supabase.co",
                             version="0.1.0", last_config_changed_at="")
    result = sender.send(cameras_online=0, last_inference=None)
    assert result == {}

def test_send_includes_apikey_header_and_establishment_token_in_body(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"config_updated": False}
    mock_resp.raise_for_status = MagicMock()
    mock_post = mocker.patch("httpx.post", return_value=mock_resp)

    sender = HeartbeatSender(token="est-tok-uuid", supabase_url="https://x.supabase.co",
                             version="0.1.0", last_config_changed_at="", anon_key="anon-key-abc")
    sender.send(cameras_online=1, last_inference=None)

    _, kwargs = mock_post.call_args
    assert kwargs["headers"]["apikey"] == "anon-key-abc"
    assert kwargs["headers"]["Authorization"] == "Bearer est-tok-uuid"
    assert kwargs["json"]["establishment_token"] == "est-tok-uuid"
