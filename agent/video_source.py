"""Abre stream RTSP ou webcam local (dev/teste)."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agent.models import Camera


def open_video_capture(camera: "Camera"):
    import cv2

    ip = (camera.ip or "").strip().lower()
    if ip in ("webcam", "device:0", "0") or ip.startswith("/dev/video"):
        idx = 0
        if ip.startswith("device:"):
            try:
                idx = int(ip.split(":", 1)[1])
            except ValueError:
                idx = 0
        return cv2.VideoCapture(idx)
    return cv2.VideoCapture(camera.rtsp_url)
