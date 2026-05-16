from __future__ import annotations
import datetime
import logging
import threading
from typing import TYPE_CHECKING, Optional, Callable
from agent.models import Camera, CountEvent
from agent.evidence_uploader import frame_to_b64

if TYPE_CHECKING:
    import numpy as np

logger = logging.getLogger(__name__)


class SimpleTracker:
    """Tracker IOU simples — substitui ByteTrack sem precisar de PyTorch."""

    def __init__(self, max_disappeared: int = 20, iou_threshold: float = 0.3):
        self._next_id = 0
        self._tracks: dict[int, dict] = {}
        self._max_gone = max_disappeared
        self._iou_thresh = iou_threshold

    def update(self, boxes: list[tuple]) -> dict[int, tuple]:
        """boxes: lista de (x1,y1,x2,y2). Retorna {track_id: (x1,y1,x2,y2)}."""
        if not boxes:
            for tid in list(self._tracks):
                self._tracks[tid]["gone"] += 1
                if self._tracks[tid]["gone"] > self._max_gone:
                    del self._tracks[tid]
            return {tid: t["box"] for tid, t in self._tracks.items()}

        if not self._tracks:
            for box in boxes:
                self._tracks[self._next_id] = {"box": box, "gone": 0}
                self._next_id += 1
            return {tid: t["box"] for tid, t in self._tracks.items()}

        track_ids = list(self._tracks)
        matched_det: set[int] = set()
        matched_trk: set[int] = set()

        for di, det in enumerate(boxes):
            best_iou, best_j = self._iou_thresh, -1
            for j, tid in enumerate(track_ids):
                if j in matched_trk:
                    continue
                iou = self._iou(det, self._tracks[tid]["box"])
                if iou > best_iou:
                    best_iou, best_j = iou, j
            if best_j >= 0:
                tid = track_ids[best_j]
                self._tracks[tid] = {"box": det, "gone": 0}
                matched_det.add(di)
                matched_trk.add(best_j)

        for di, det in enumerate(boxes):
            if di not in matched_det:
                self._tracks[self._next_id] = {"box": det, "gone": 0}
                self._next_id += 1

        for j, tid in enumerate(track_ids):
            if j not in matched_trk:
                self._tracks[tid]["gone"] += 1
                if self._tracks[tid]["gone"] > self._max_gone:
                    del self._tracks[tid]

        return {tid: t["box"] for tid, t in self._tracks.items()}

    @staticmethod
    def _iou(a: tuple, b: tuple) -> float:
        ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
        ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        if inter == 0:
            return 0.0
        area_a = (a[2] - a[0]) * (a[3] - a[1])
        area_b = (b[2] - b[0]) * (b[3] - b[1])
        return inter / (area_a + area_b - inter)


class LineCrossDetector:
    def __init__(self, line_y: float, frame_height: int):
        self._line_y = line_y
        self._line_px = line_y * frame_height
        self._prev: dict[int, float] = {}

    def set_frame_height(self, frame_height: int) -> None:
        self._line_px = self._line_y * frame_height

    def update_track(self, track_id: int, centroid_y: float) -> Optional[str]:
        prev_y = self._prev.get(track_id)
        self._prev[track_id] = centroid_y
        if prev_y is None:
            return None
        if prev_y < self._line_px <= centroid_y:
            return "out"
        if prev_y >= self._line_px > centroid_y:
            return "in"
        return None

    def cleanup_stale_tracks(self, active_ids: set[int]) -> None:
        for tid in list(self._prev):
            if tid not in active_ids:
                del self._prev[tid]


class PeopleCounter:
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
            import numpy as np
            import onnxruntime as ort
        except ImportError as exc:
            logger.error("missing dependency: %s", exc)
            return

        import os
        model_path = os.environ.get("YOLO_MODEL_PATH", "yolov8n.onnx")
        session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        input_name = session.get_inputs()[0].name

        tracker = SimpleTracker()
        detector = LineCrossDetector(line_y=self._camera.line_y, frame_height=480)
        cap = cv2.VideoCapture(self._camera.rtsp_url)

        if not cap.isOpened():
            logger.error("cannot open RTSP stream: %s", self._camera.id)
            cap.release()
            return

        frame_count = 0
        SAMPLE_EVERY = 10

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

            # pré-processa para 640x640
            img = cv2.resize(frame, (640, 640))
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            img = np.transpose(img, (2, 0, 1))[np.newaxis]

            raw = session.run(None, {input_name: img})[0][0].T  # (8400, 84)
            person_scores = raw[:, 4]
            mask = person_scores > 0.5
            boxes_raw = raw[mask, :4]
            scores_f = person_scores[mask]

            self._last_inference = datetime.datetime.now(datetime.timezone.utc)

            detections: list[tuple] = []
            if len(boxes_raw):
                cx, cy, bw, bh = boxes_raw[:, 0], boxes_raw[:, 1], boxes_raw[:, 2], boxes_raw[:, 3]
                x1 = (cx - bw / 2) / 640 * w
                y1 = (cy - bh / 2) / 640 * h
                x2 = (cx + bw / 2) / 640 * w
                y2 = (cy + bh / 2) / 640 * h

                indices = cv2.dnn.NMSBoxes(
                    [[float(x1[i]), float(y1[i]), float(x2[i] - x1[i]), float(y2[i] - y1[i])] for i in range(len(x1))],
                    scores_f.tolist(), 0.5, 0.4,
                )
                for i in (indices.flatten() if len(indices) else []):
                    detections.append((float(x1[i]), float(y1[i]), float(x2[i]), float(y2[i])))

            tracks = tracker.update(detections)
            active_ids: set[int] = set(tracks)

            for tid, (bx1, by1, bx2, by2) in tracks.items():
                centroid_y = (by1 + by2) / 2
                direction = detector.update_track(tid, centroid_y)
                if direction == "in":
                    self._count_in += 1
                    self._emit(frame)
                elif direction == "out":
                    self._count_out += 1
                    self._emit(frame)

            detector.cleanup_stale_tracks(active_ids)

        cap.release()
        logger.info("people counter stopped: camera=%s", self._camera.id)

    def _emit(self, frame: "Optional[np.ndarray]" = None) -> None:
        event = CountEvent(
            camera_id=self._camera.id,
            count_in=self._count_in,
            count_out=self._count_out,
            people_inside=max(0, self._count_in - self._count_out),
            recorded_at=datetime.datetime.now(datetime.timezone.utc),
            evidence_b64=frame_to_b64(frame) if frame is not None else None,
        )
        self._on_event(event)
