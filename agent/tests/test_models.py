# agent/tests/test_models.py
import pytest
from agent.models import Camera, AgentConfig, CountEvent, HeartbeatPayload

def test_camera_from_dict_minimal():
    raw = {"id": "cam-1", "ip": "192.168.1.10", "user": "admin", "pass": "1234",
           "role": "counting", "name": "Entrada"}
    cam = Camera.from_dict(raw)
    assert cam.id == "cam-1"
    assert cam.ip == "192.168.1.10"
    assert cam.role == "counting"
    assert cam.line_y == 0.5  # default

def test_camera_from_dict_with_line_y():
    raw = {"id": "c", "ip": "10.0.0.1", "user": "u", "pass": "p",
           "role": "counting", "name": "N", "line_y": 0.3}
    cam = Camera.from_dict(raw)
    assert cam.line_y == 0.3

def test_camera_rtsp_url_default_path():
    cam = Camera(id="c", ip="192.168.1.5", user="admin", password="pass",
                 role="counting", name="N", line_y=0.5, rtsp_path="/stream1")
    assert cam.rtsp_url == "rtsp://admin:pass@192.168.1.5/stream1"

def test_camera_rtsp_url_custom_path():
    cam = Camera(id="c", ip="192.168.1.5", user="u", password="p",
                 role="counting", name="N", line_y=0.5, rtsp_path="/cam/0/h264")
    assert cam.rtsp_url == "rtsp://u:p@192.168.1.5/cam/0/h264"

def test_agent_config_counting_cameras():
    config = AgentConfig(
        agent_id="id-1",
        name="Pi Eduardo",
        cameras=[
            Camera(id="c1", ip="1.2.3.4", user="u", password="p",
                   role="counting", name="N", line_y=0.5, rtsp_path="/s1"),
            Camera(id="c2", ip="1.2.3.5", user="u", password="p",
                   role="cash", name="Caixa", line_y=0.5, rtsp_path="/s1"),
        ],
        thresholds={},
        heartbeat_interval=300,
        webhook_token="tok-abc",
        supabase_url="https://x.supabase.co",
        config_changed_at="2026-05-05T10:00:00Z",
    )
    counting = config.counting_cameras
    assert len(counting) == 1
    assert counting[0].id == "c1"

def test_count_event_fields():
    import datetime
    ev = CountEvent(camera_id="cam-1", count_in=3, count_out=1,
                    people_inside=2, recorded_at=datetime.datetime.utcnow())
    assert ev.people_inside == 2

def test_count_event_to_dict():
    import datetime
    ev = CountEvent(camera_id="cam-1", count_in=3, count_out=1,
                    people_inside=2, recorded_at=datetime.datetime(2026, 5, 5, 10, 0, 0))
    d = ev.to_dict()
    assert d["camera_id"] == "cam-1"
    assert d["count_in"] == 3
    assert d["people_inside"] == 2
    assert "recorded_at" in d
    assert d["recorded_at"].endswith("Z")

def test_heartbeat_payload_serialization():
    import datetime
    hb = HeartbeatPayload(version="0.1.0", cameras_online=2,
                          last_inference=datetime.datetime(2026,5,5,10,0,0),
                          last_config_changed_at="2026-05-05T10:00:00Z")
    d = hb.to_dict()
    assert d["version"] == "0.1.0"
    assert d["cameras_online"] == 2
    assert "last_inference" in d
    assert d["last_config_changed_at"] == "2026-05-05T10:00:00Z"
