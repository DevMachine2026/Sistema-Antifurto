# agent/tests/test_event_publisher.py
import datetime, json, pytest
from unittest.mock import MagicMock
from agent.event_publisher import EventPublisher
from agent.models import CountEvent

def make_event():
    return CountEvent(
        camera_id="cam-1",
        count_in=3, count_out=1, people_inside=2,
        recorded_at=datetime.datetime(2026, 5, 5, 10, 0, 0),
    )

def test_publish_success(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mocker.patch("httpx.post", return_value=mock_resp)

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="tok", db_path=":memory:")
    pub.publish(make_event())

    import httpx
    httpx.post.assert_called_once()
    call_kwargs = httpx.post.call_args
    payload = json.loads(call_kwargs.kwargs.get("content") or call_kwargs.args[1])
    assert payload["camera_id"] == "cam-1"
    assert payload["count_in"] == 3
    assert payload["people_inside"] == 2

def test_publish_queues_on_failure(mocker):
    import httpx
    mocker.patch("httpx.post", side_effect=httpx.ConnectError("timeout"))

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="tok", db_path=":memory:")
    pub.publish(make_event())

    assert pub.queue_size() == 1

def test_publish_sends_apikey_header(mocker):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mock_post = mocker.patch("httpx.post", return_value=mock_resp)

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="wh-tok", db_path=":memory:", anon_key="anon-key-abc")
    pub.publish(make_event())

    _, kwargs = mock_post.call_args
    assert kwargs["headers"]["apikey"] == "anon-key-abc"
    assert kwargs["headers"]["Authorization"] == "Bearer wh-tok"

def test_flush_queue_on_reconnect(mocker):
    import httpx
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    call_count = {"n": 0}
    def side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise httpx.ConnectError("timeout")
        return mock_resp
    mocker.patch("httpx.post", side_effect=side_effect)

    pub = EventPublisher(webhook_url="https://x.supabase.co/functions/v1/webhook-camera",
                         webhook_token="tok", db_path=":memory:")
    pub.publish(make_event())
    assert pub.queue_size() == 1

    pub.flush_queue()
    assert pub.queue_size() == 0
