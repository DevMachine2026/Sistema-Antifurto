"""
Câmera de caixa: uma única conexão RTSP por câmera.

- Ring-buffer de frames para evidência (60 s @ 2 fps)
- Detecção de movimento na ROI (mesmo loop — sem segundo VideoCapture)
"""
from __future__ import annotations

import datetime
import logging
import threading
import time
from collections import deque
from typing import TYPE_CHECKING, Callable, Optional

from agent.evidence_uploader import frame_to_b64
from agent.models import Camera, CashEvent
from agent.rtsp_capture import open_capture, reopen_capture

if TYPE_CHECKING:
    import numpy as np

logger = logging.getLogger(__name__)

_SAMPLE_FPS = 2
_BUFFER_SECS = 60
_BUFFER_SIZE = _SAMPLE_FPS * _BUFFER_SECS

_MIN_CONFIDENCE = 0.70
_COOLDOWN_SEC = 45.0
_MOTION_THRESHOLD = 25.0


class CashMonitor:
    def __init__(
        self,
        camera: Camera,
        on_event: Optional[Callable[[CashEvent], None]] = None,
        window_minutes: int = 15,
        cooldown_sec: float = _COOLDOWN_SEC,
    ):
        self._camera = camera
        self._on_event = on_event
        self._window_minutes = window_minutes
        self._cooldown_sec = cooldown_sec
        self._buf: deque[tuple[datetime.datetime, "np.ndarray"]] = deque(maxlen=_BUFFER_SIZE)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_event_at: float = 0.0

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name=f"cash-{self._camera.id}"
        )
        self._thread.start()
        logger.info("cash pipeline started: camera=%s", self._camera.id)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def get_nearest_frame_b64(self, ts: datetime.datetime) -> Optional[str]:
        with self._lock:
            if not self._buf:
                return None
            frame = min(self._buf, key=lambda x: abs((x[0] - ts).total_seconds()))[1]
        return frame_to_b64(frame)

    def latest_frame_b64(self) -> Optional[str]:
        with self._lock:
            if not self._buf:
                return None
            return frame_to_b64(self._buf[-1][1])

    def _maybe_emit(self, motion_score: float, frame: "np.ndarray") -> None:
        if not self._on_event:
            return
        now = time.monotonic()
        if now - self._last_event_at < self._cooldown_sec:
            return
        confidence = min(1.0, _MIN_CONFIDENCE + (motion_score - _MOTION_THRESHOLD) / 200.0)
        if confidence < _MIN_CONFIDENCE:
            return
        detected_at = datetime.datetime.now(datetime.timezone.utc)
        self._last_event_at = now
        event = CashEvent(
            camera_id=self._camera.id,
            detected_at=detected_at,
            confidence=confidence,
            window_minutes=self._window_minutes,
            evidence_b64=frame_to_b64(frame),
        )
        self._on_event(event)
        logger.info(
            "cash activity: camera=%s confidence=%.2f motion=%.1f",
            self._camera.id,
            confidence,
            motion_score,
        )

    def _run(self) -> None:
        try:
            import cv2
            import numpy as np
        except ImportError as exc:
            logger.error("cash pipeline: missing dependency: %s", exc)
            return

        cap = open_capture(self._camera)
        if not cap.isOpened():
            logger.error("cash pipeline: cannot open stream: %s", self._camera.id)
            cap.release()
            return

        frame_count = 0
        skip = max(1, int(cap.get(cv2.CAP_PROP_FPS) / _SAMPLE_FPS)) if cap.get(cv2.CAP_PROP_FPS) > 0 else 15
        prev_roi: Optional[np.ndarray] = None
        reconnect_failures = 0

        while not self._stop.is_set():
            ret, frame = cap.read()
            if not ret:
                logger.warning("cash pipeline: stream lost, reconnecting: %s", self._camera.id)
                cap = reopen_capture(self._camera, cap, wait_sec=5.0 if not self._stop.is_set() else 0)
                if not cap.isOpened():
                    reconnect_failures += 1
                    if reconnect_failures >= 12:
                        logger.error("cash pipeline: gave up reconnecting: %s", self._camera.id)
                        break
                    self._stop.wait(min(30, 5 * reconnect_failures))
                    continue
                reconnect_failures = 0
                frame_count = 0
                prev_roi = None
                continue

            frame_count += 1
            if frame_count % skip != 0:
                continue

            now = datetime.datetime.now(datetime.timezone.utc)
            frame_copy = frame.copy()
            with self._lock:
                self._buf.append((now, frame_copy))

            h, w = frame.shape[:2]
            y0, y1 = int(h * 0.45), h
            x0, x1 = int(w * 0.25), int(w * 0.75)
            roi = cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
            roi = cv2.GaussianBlur(roi, (5, 5), 0)

            if prev_roi is not None and prev_roi.shape == roi.shape:
                score = float(cv2.absdiff(prev_roi, roi).mean())
                if score >= _MOTION_THRESHOLD:
                    self._maybe_emit(score, frame_copy)

            prev_roi = roi

        cap.release()
        logger.info("cash pipeline stopped: camera=%s", self._camera.id)


_monitors: dict[str, CashMonitor] = {}


def start_cash_pipeline(
    cameras: list[Camera],
    on_event: Callable[[CashEvent], None],
    window_minutes: int = 15,
) -> None:
    """Uma thread + um RTSP por câmera de caixa (buffer + detecção de movimento)."""
    stop_all()
    for cam in cameras:
        if not cam.is_cash:
            continue
        if cam.id in _monitors:
            continue
        m = CashMonitor(cam, on_event=on_event, window_minutes=window_minutes)
        m.start()
        _monitors[cam.id] = m


def start_cash_monitors(cameras: list[Camera]) -> None:
    """Legado: só buffer sem detecção (evitar em produção)."""
    for cam in cameras:
        if cam.is_cash and cam.id not in _monitors:
            m = CashMonitor(cam)
            m.start()
            _monitors[cam.id] = m


def stop_all() -> None:
    for m in _monitors.values():
        m.stop()
    _monitors.clear()


def get_evidence_for_camera(camera_id: str, ts: Optional[datetime.datetime] = None) -> Optional[str]:
    monitor = _monitors.get(camera_id)
    if not monitor:
        return None
    if ts:
        return monitor.get_nearest_frame_b64(ts)
    return monitor.latest_frame_b64()
