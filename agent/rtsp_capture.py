"""Helpers OpenCV para streams instáveis (buffer mínimo, reconexão)."""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from agent.video_source import open_video_capture

if TYPE_CHECKING:
    from agent.models import Camera

logger = logging.getLogger(__name__)

try:
    import cv2
except ImportError:
    cv2 = None  # type: ignore


def open_capture(camera: "Camera"):
    cap = open_video_capture(camera)
    if cv2 is not None and cap is not None and cap.isOpened():
        ip = (camera.ip or "").strip().lower()
        if ip not in ("webcam", "device:0", "0") and not ip.startswith("/dev/video"):
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def reopen_capture(camera: "Camera", old_cap=None, wait_sec: float = 5.0):
    if old_cap is not None:
        try:
            old_cap.release()
        except Exception:
            pass
    if wait_sec > 0:
        time.sleep(wait_sec)
    cap = open_capture(camera)
    if not cap.isOpened():
        logger.error("reconnect failed: camera=%s ip=%s", camera.id, camera.ip)
    return cap
