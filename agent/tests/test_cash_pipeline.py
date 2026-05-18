# agent/tests/test_cash_pipeline.py
from agent.models import Camera, CashEvent, normalize_camera_role
from agent.cash_monitor import start_cash_pipeline, stop_all, _monitors


def test_normalize_camera_role_aliases():
    assert normalize_camera_role("cash_register") == "cash"
    assert normalize_camera_role("people_counting") == "counting"
    assert normalize_camera_role("cash") == "cash"


def test_camera_is_cash():
    cam = Camera(
        id="c1",
        ip="10.0.0.1",
        user="u",
        password="p",
        role="cash_register",
        name="Caixa",
        line_y=0.5,
        rtsp_path="/s1",
    )
    assert cam.is_cash is True
    assert cam.role == "cash"


def test_cash_event_payload():
    import datetime

    ev = CashEvent(
        camera_id="cam-caixa",
        detected_at=datetime.datetime(2026, 5, 17, 12, 0, 0, tzinfo=datetime.timezone.utc),
        confidence=0.85,
        window_minutes=15,
        evidence_b64="abc",
    )
    d = ev.to_dict()
    assert d["camera_id"] == "cam-caixa"
    assert d["confidence"] == 0.85
    assert d["evidence_image"] == "abc"


def test_start_cash_pipeline_filters_role(monkeypatch):
    stop_all()
    started = []

    class FakeMonitor:
        def __init__(self, camera, on_event=None, window_minutes=15, cooldown_sec=45.0):
            self._camera = camera

        def start(self):
            started.append(self._camera.id)

        def stop(self):
            pass

    monkeypatch.setattr("agent.cash_monitor.CashMonitor", FakeMonitor)

    cameras = [
        Camera("c-count", "1.1.1.1", "u", "p", "counting", "Entrada", 0.5, "/s"),
        Camera("c-cash", "1.1.1.2", "u", "p", "cash", "Caixa", 0.5, "/s"),
    ]
    start_cash_pipeline(cameras, on_event=lambda e: None)
    assert started == ["c-cash"]
    stop_all()
