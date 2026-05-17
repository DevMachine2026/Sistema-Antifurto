# agent/cash_detector.py
"""
Detecção heurística de atividade no caixa (movimento na ROI inferior-central).

Substituível por modelo dedicado (notas/mãos) sem alterar o contrato webhook-cash.
"""
from __future__ import annotations

import datetime
import logging
import threading
from typing import Callable, Optional

from agent.cash_monitor import get_evidence_for_camera
from agent.models import Camera, CashEvent

logger = logging.getLogger(__name__)

_MIN_CONFIDENCE = 0.70
_COOLDOWN_SEC = 45.0
_MOTION_THRESHOLD = 25.0  # média de diferença absoluta na ROI (0–255)


class CashDetector:
    def __init__(
        self,
        camera: Camera,
        on_event: Callable[[CashEvent], None],
        window_minutes: int = 15,
        cooldown_sec: float = _COOLDOWN_SEC,
    ):
        self._camera = camera
        self._on_event = on_event
        self._window_minutes = window_minutes
        self._cooldown_sec = cooldown_sec
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_event_at: float = 0.0

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name=f"cash-detector-{self._camera.id}",
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        try:
            import cv2
            import numpy as np
        except ImportError as exc:
            logger.error("cash detector: missing dependency: %s", exc)
            return

        cap = cv2.VideoCapture(self._camera.rtsp_url)
        if not cap.isOpened():
            logger.error("cash detector: cannot open RTSP: %s", self._camera.id)
            cap.release()
            return

        prev_roi: Optional[np.ndarray] = None

        while not self._stop.is_set():
            ret, frame = cap.read()
            if not ret:
                self._stop.wait(3)
                if self._stop.is_set():
                    break
                cap.release()
                cap = cv2.VideoCapture(self._camera.rtsp_url)
                prev_roi = None
                continue

            h, w = frame.shape[:2]
            y0, y1 = int(h * 0.45), h
            x0, x1 = int(w * 0.25), int(w * 0.75)
            roi = cv2.cvtColor(frame[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
            roi = cv2.GaussianBlur(roi, (5, 5), 0)

            if prev_roi is not None and prev_roi.shape == roi.shape:
                diff = cv2.absdiff(prev_roi, roi)
                score = float(diff.mean())
                if score >= _MOTION_THRESHOLD:
                    self._maybe_emit(score)

            prev_roi = roi
            self._stop.wait(0.25)

        cap.release()

    def _maybe_emit(self, motion_score: float) -> None:
        import time

        now = time.monotonic()
        if now - self._last_event_at < self._cooldown_sec:
            return

        confidence = min(1.0, _MIN_CONFIDENCE + (motion_score - _MOTION_THRESHOLD) / 200.0)
        if confidence < _MIN_CONFIDENCE:
            return

        detected_at = datetime.datetime.now(datetime.timezone.utc)
        evidence = get_evidence_for_camera(self._camera.id, detected_at)

        event = CashEvent(
            camera_id=self._camera.id,
            detected_at=detected_at,
            confidence=confidence,
            window_minutes=self._window_minutes,
            evidence_b64=evidence,
        )
        self._last_event_at = now
        self._on_event(event)
        logger.info(
            "cash activity: camera=%s confidence=%.2f motion=%.1f",
            self._camera.id,
            confidence,
            motion_score,
        )


_detectors: list[CashDetector] = []


def start_cash_detectors(
    cameras: list[Camera],
    on_event: Callable[[CashEvent], None],
    window_minutes: int = 15,
) -> None:
    stop_cash_detectors()
    for cam in cameras:
        if not cam.is_cash:
            continue
        det = CashDetector(cam, on_event=on_event, window_minutes=window_minutes)
        det.start()
        _detectors.append(det)


def stop_cash_detectors() -> None:
    for det in _detectors:
        det.stop()
    _detectors.clear()
