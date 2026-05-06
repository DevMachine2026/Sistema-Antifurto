# agent/people_counter.py
from __future__ import annotations
import datetime
import logging
import threading
from typing import Optional, Callable
from agent.models import Camera, CountEvent

logger = logging.getLogger(__name__)


class LineCrossDetector:
    """Rastreia posição de tracks e detecta cruzamento de linha horizontal."""

    def __init__(self, line_y: float, frame_height: int):
        self._line_y = line_y
        self._line_px = line_y * frame_height
        self._prev: dict[int, float] = {}  # track_id -> centroid_y anterior

    def set_frame_height(self, frame_height: int) -> None:
        self._line_px = self._line_y * frame_height

    def update_track(self, track_id: int, centroid_y: float) -> Optional[str]:
        """Atualiza posição do track. Retorna 'in', 'out' ou None."""
        prev_y = self._prev.get(track_id)
        self._prev[track_id] = centroid_y

        if prev_y is None:
            return None  # primeira detecção nunca cruza

        if prev_y < self._line_px <= centroid_y:
            return "out"
        if prev_y >= self._line_px > centroid_y:
            return "in"
        return None

    def cleanup_stale_tracks(self, active_ids: set[int]) -> None:
        """Remove tracks que sumiram do frame."""
        for tid in list(self._prev.keys()):
            if tid not in active_ids:
                del self._prev[tid]


class PeopleCounter:
    """
    Abre stream RTSP de uma câmera, roda YOLOv8-nano,
    chama on_event quando alguém cruza a linha virtual.
    Roda em thread própria.
    """

    def __init__(self, camera: Camera, on_event: Callable[[CountEvent], None]):
        self._camera = camera
        self._on_event = on_event
        self._count_in = 0
        self._count_out = 0
        self._last_inference: Optional[datetime.datetime] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        self._stop_event.clear()
        self._running = True
        self._thread = threading.Thread(
            target=self._run, daemon=True, name=f"counter-{self._camera.id}"
        )
        self._thread.start()
        logger.info("people counter started: camera=%s", self._camera.id)

    def stop(self) -> None:
        self._stop_event.set()
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    @property
    def last_inference(self) -> Optional[datetime.datetime]:
        return self._last_inference

    def _run(self) -> None:
        try:
            import cv2
            from ultralytics import YOLO
        except ImportError as exc:
            logger.error("missing dependency: %s — install requirements.txt", exc)
            return

        import os
        model_path = os.environ.get("YOLO_MODEL_PATH", "yolov8n.pt")
        model = YOLO(model_path)  # baixa na primeira execução (~6MB)
        detector = LineCrossDetector(
            line_y=self._camera.line_y,
            frame_height=480,  # será atualizado após primeiro frame
        )

        cap = cv2.VideoCapture(self._camera.rtsp_url)
        if not cap.isOpened():
            logger.error("cannot open RTSP stream: %s", self._camera.id)
            cap.release()
            return

        frame_count = 0
        SAMPLE_EVERY = 10  # processa 1 de cada 10 frames (~1 FPS para 10 FPS de câmera)

        while self._running:
            ret, frame = cap.read()
            if not ret:
                logger.warning("camera %s lost, reconnecting...", self._camera.id)
                cap.release()
                self._stop_event.wait(5)
                cap = cv2.VideoCapture(self._camera.rtsp_url)
                continue

            frame_count += 1
            if frame_count % SAMPLE_EVERY != 0:
                continue

            h, w = frame.shape[:2]
            detector.set_frame_height(h)

            results = model.track(
                frame,
                persist=True,
                classes=[0],  # classe 0 = person
                verbose=False,
                stream=False,
            )

            self._last_inference = datetime.datetime.now(datetime.timezone.utc)
            active_ids: set[int] = set()

            for result in results:
                if result.boxes is None:
                    continue
                boxes = result.boxes
                if boxes.id is None:
                    continue

                for box, track_id in zip(boxes.xyxy, boxes.id):
                    tid = int(track_id.item())
                    active_ids.add(tid)
                    x1, y1, x2, y2 = box.tolist()
                    centroid_y = (y1 + y2) / 2

                    direction = detector.update_track(tid, centroid_y)
                    if direction == "in":
                        self._count_in += 1
                        self._emit()
                    elif direction == "out":
                        self._count_out += 1
                        self._emit()

            detector.cleanup_stale_tracks(active_ids)

        cap.release()
        logger.info("people counter stopped: camera=%s", self._camera.id)

    def _emit(self) -> None:
        event = CountEvent(
            camera_id=self._camera.id,
            count_in=self._count_in,
            count_out=self._count_out,
            people_inside=max(0, self._count_in - self._count_out),
            recorded_at=datetime.datetime.now(datetime.timezone.utc),
        )
        self._on_event(event)
