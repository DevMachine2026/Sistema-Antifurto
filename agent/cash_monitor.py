"""
Captura periódica de frames da câmera do caixa.

Mantém um ring-buffer das últimas N frames (padrão: 60 s a 2 fps = 120 frames).
O event_publisher chama get_nearest_frame(timestamp) para obter a imagem mais
próxima do momento de um evento de caixa e enviá-la como evidence_image.
"""
from __future__ import annotations

import datetime
import logging
import threading
from collections import deque
from typing import TYPE_CHECKING, Optional

from agent.evidence_uploader import frame_to_b64
from agent.models import Camera

if TYPE_CHECKING:
    import numpy as np

logger = logging.getLogger(__name__)

_SAMPLE_FPS   = 2        # frames capturados por segundo
_BUFFER_SECS  = 60       # segundos de histórico mantido em memória
_BUFFER_SIZE  = _SAMPLE_FPS * _BUFFER_SECS  # 120 frames


class CashMonitor:
    """
    Loop em background que conecta à câmera do caixa via RTSP e mantém
    um buffer circular de (timestamp, frame).
    """

    def __init__(self, camera: Camera):
        self._camera = camera
        self._buf: deque[tuple[datetime.datetime, "np.ndarray"]] = deque(maxlen=_BUFFER_SIZE)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name=f"cash-monitor-{self._camera.id}"
        )
        self._thread.start()
        logger.info("cash monitor started: camera=%s", self._camera.id)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def get_nearest_frame_b64(self, ts: datetime.datetime) -> Optional[str]:
        """Retorna o frame JPEG (base64) mais próximo de 'ts', ou None."""
        with self._lock:
            if not self._buf:
                return None
            frame = min(self._buf, key=lambda x: abs((x[0] - ts).total_seconds()))[1]
        return frame_to_b64(frame)

    def latest_frame_b64(self) -> Optional[str]:
        """Retorna o frame mais recente do buffer, ou None."""
        with self._lock:
            if not self._buf:
                return None
            frame = self._buf[-1][1]
        return frame_to_b64(frame)

    def _run(self) -> None:
        try:
            import cv2
        except ImportError as exc:
            logger.error("cash monitor: missing dependency: %s", exc)
            return

        interval = 1.0 / _SAMPLE_FPS
        cap = cv2.VideoCapture(self._camera.rtsp_url)

        if not cap.isOpened():
            logger.error("cash monitor: cannot open RTSP: %s", self._camera.id)
            cap.release()
            return

        frame_count = 0
        SKIP = max(1, int(cap.get(cv2.CAP_PROP_FPS) / _SAMPLE_FPS)) if cap.get(cv2.CAP_PROP_FPS) > 0 else 15

        while not self._stop.is_set():
            ret, frame = cap.read()
            if not ret:
                logger.warning("cash monitor: stream lost, reconnecting: %s", self._camera.id)
                cap.release()
                self._stop.wait(5)
                if self._stop.is_set():
                    break
                cap = cv2.VideoCapture(self._camera.rtsp_url)
                frame_count = 0
                continue

            frame_count += 1
            if frame_count % SKIP != 0:
                continue

            now = datetime.datetime.now(datetime.timezone.utc)
            with self._lock:
                self._buf.append((now, frame.copy()))

        cap.release()
        logger.info("cash monitor stopped: camera=%s", self._camera.id)


# ── registry global (um monitor por câmera de caixa) ─────────────────────

_monitors: dict[str, CashMonitor] = {}


def start_cash_monitors(cameras: list[Camera]) -> None:
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
    """
    Retorna o frame (base64 JPEG) mais próximo de 'ts' para a câmera dada,
    ou None se não houver monitor ativo ou buffer vazio.
    """
    monitor = _monitors.get(camera_id)
    if not monitor:
        return None
    if ts:
        return monitor.get_nearest_frame_b64(ts)
    return monitor.latest_frame_b64()
