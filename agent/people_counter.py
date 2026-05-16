from __future__ import annotations
import datetime
import logging
import threading
import time
from typing import TYPE_CHECKING, Optional, Callable

import numpy as np

from agent.models import Camera, CountEvent
from agent.evidence_uploader import frame_to_b64

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ─── SORT Tracker ─────────────────────────────────────────────────────────────
# Kalman filter (modelo velocidade constante) + atribuição greedy-ótima.
# Substitui SimpleTracker (IOU greedy sem predição): o Kalman prediz onde o
# track estará no próximo frame, mantendo o ID mesmo com oclusões parciais.
# Não requer scipy — a atribuição greedy é ótima para N < 30 tracks.


class KalmanBoxTracker:
    """
    Rastreia um bounding box com filtro de Kalman (velocidade constante).

    Estado: [cx, cy, vx, vy]  — centroid + velocidade
    Observação: [cx, cy]
    """

    def __init__(self, bbox: tuple[float, float, float, float], track_id: int) -> None:
        cx = (bbox[0] + bbox[2]) / 2.0
        cy = (bbox[1] + bbox[3]) / 2.0

        self.id = track_id
        self.bbox = bbox
        self.hits = 1        # frames em que foi detectado
        self.hit_streak = 1  # detecções consecutivas (reset quando perde)
        self.time_since_update = 0
        self.age = 0

        # Estado [cx, cy, vx, vy]
        self._x = np.array([[cx], [cy], [0.0], [0.0]])

        # Transição de estado (velocidade constante: cx += vx, cy += vy)
        self._F = np.array([
            [1, 0, 1, 0],
            [0, 1, 0, 1],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ], dtype=float)

        # Matriz de observação (mede cx e cy)
        self._H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)

        # Covariâncias
        self._P = np.diag([10.0, 10.0, 100.0, 100.0])  # alta incerteza de velocidade inicial
        self._Q = np.diag([0.5, 0.5, 0.5, 0.5])         # ruído de processo
        self._R = np.diag([5.0, 5.0])                    # ruído de medição

    # ------------------------------------------------------------------
    def predict(self) -> tuple[float, float, float, float]:
        """Predição Kalman. Retorna bbox predito (x1,y1,x2,y2)."""
        self._x = self._F @ self._x
        self._P = self._F @ self._P @ self._F.T + self._Q
        self.age += 1
        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1
        cx, cy = float(self._x[0, 0]), float(self._x[1, 0])
        hw = (self.bbox[2] - self.bbox[0]) / 2.0
        hh = (self.bbox[3] - self.bbox[1]) / 2.0
        return (cx - hw, cy - hh, cx + hw, cy + hh)

    def update(self, bbox: tuple[float, float, float, float]) -> None:
        """Atualização Kalman com detecção confirmada."""
        cx = (bbox[0] + bbox[2]) / 2.0
        cy = (bbox[1] + bbox[3]) / 2.0
        z = np.array([[cx], [cy]])

        S = self._H @ self._P @ self._H.T + self._R
        K = self._P @ self._H.T @ np.linalg.inv(S)
        self._x = self._x + K @ (z - self._H @ self._x)
        self._P = (np.eye(4) - K @ self._H) @ self._P

        self.bbox = bbox
        self.time_since_update = 0
        self.hits += 1
        self.hit_streak += 1

    @property
    def centroid(self) -> tuple[float, float]:
        return float(self._x[0, 0]), float(self._x[1, 0])

    @property
    def velocity(self) -> tuple[float, float]:
        """Velocidade estimada pelo Kalman (pixels/frame)."""
        return float(self._x[2, 0]), float(self._x[3, 0])


def _iou(a: tuple, b: tuple) -> float:
    ix1 = max(a[0], b[0]); iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2]); iy2 = min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter == 0.0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _greedy_assign(
    detections: list[tuple],
    predictions: list[tuple],
    iou_threshold: float,
) -> list[tuple[int, int]]:
    """
    Atribuição greedy ótima entre detecções e predições.
    Ordena todos os pares por IoU (desc) e atribui sem conflito.
    Para N < 30 (caso típico de porta de bar), é equivalente ao Hungarian.
    """
    if not detections or not predictions:
        return []

    scores: list[tuple[float, int, int]] = []
    for d, det in enumerate(detections):
        for t, pred in enumerate(predictions):
            iou = _iou(det, pred)
            if iou >= iou_threshold:
                scores.append((iou, d, t))

    scores.sort(reverse=True)
    used_d: set[int] = set()
    used_t: set[int] = set()
    matched: list[tuple[int, int]] = []
    for _, d, t in scores:
        if d not in used_d and t not in used_t:
            matched.append((d, t))
            used_d.add(d)
            used_t.add(t)
    return matched


class SORTTracker:
    """
    SORT (Simple Online Realtime Tracking) simplificado — puro numpy.

    Melhora crítica sobre SimpleTracker:
    - Kalman prediz posição entre frames → ID persiste mesmo com oclusão parcial
    - Atribuição global ótima → sem trocas de ID quando pessoas ficam próximas
    - min_hits: só expõe tracks confirmados (filtra detecções falsas do YOLO)
    - max_age: track sobrevive até N frames sem detecção (oclusão breve)
    """

    def __init__(
        self,
        max_age: int = 5,
        min_hits: int = 2,
        iou_threshold: float = 0.25,
    ) -> None:
        self._max_age = max_age
        self._min_hits = min_hits
        self._iou_threshold = iou_threshold
        self._tracks: list[KalmanBoxTracker] = []
        self._next_id = 0

    def update(self, detections: list[tuple]) -> list[KalmanBoxTracker]:
        """
        Processa um frame. Retorna apenas tracks confirmados (hits >= min_hits).
        """
        predictions = [t.predict() for t in self._tracks]

        matches = _greedy_assign(detections, predictions, self._iou_threshold)
        matched_det = {d for d, _ in matches}
        matched_trk = {t for _, t in matches}

        # Atualiza tracks pareados
        for d, t in matches:
            self._tracks[t].update(detections[d])

        # Cria tracks novos para detecções não pareadas
        for d in range(len(detections)):
            if d not in matched_det:
                self._tracks.append(KalmanBoxTracker(detections[d], self._next_id))
                self._next_id += 1

        # Remove tracks mortos (sem detecção por max_age frames)
        self._tracks = [t for t in self._tracks if t.time_since_update <= self._max_age]

        # Retorna somente tracks maduros (confirmados por min_hits frames)
        return [t for t in self._tracks if t.hits >= self._min_hits]

    def all_ids(self) -> set[int]:
        return {t.id for t in self._tracks}


# ─── Detector de cruzamento de linha ──────────────────────────────────────────

class LineCrossDetector:
    """
    Detecta cruzamento de linha virtual com histerese e filtro direcional.

    Histerese: exige que o track saia da zona morta (±hysteresis_px em torno
    da linha) antes de confirmar a direção. Evita contar pessoas paradas na porta.

    Filtro direcional: só conta cruzamento se a velocidade Kalman é
    predominantemente perpendicular à linha (vertical). Evita contar pessoas
    andando paralelas à porta.
    """

    _DIRECTION_RATIO = 0.35  # vy deve ser ao menos 35% de |vx| para contar

    def __init__(
        self,
        line_y: float,
        frame_height: int,
        hysteresis_px: float = 15.0,
    ) -> None:
        self._line_y = line_y
        self._line_px = line_y * frame_height
        self._hysteresis = hysteresis_px
        # Lado confirmado de cada track: -1 = acima da linha, +1 = abaixo
        self._side: dict[int, int] = {}

    def set_frame_height(self, frame_height: int) -> None:
        self._line_px = self._line_y * frame_height

    def update_track(self, track: KalmanBoxTracker) -> Optional[str]:
        tid = track.id
        _, cy = track.centroid
        _, vy = track.velocity

        # Filtro direcional: movimento deve ser principalmente vertical
        vx, _ = track.velocity
        if abs(vy) < abs(vx) * self._DIRECTION_RATIO:
            return None

        # Zona morta de histerese: centroide dentro de ±hysteresis_px da linha
        above_zone = cy < self._line_px - self._hysteresis
        below_zone = cy > self._line_px + self._hysteresis

        if above_zone:
            new_side = -1
        elif below_zone:
            new_side = 1
        else:
            return None  # na zona morta — aguarda saída

        prev_side = self._side.get(tid)
        self._side[tid] = new_side

        if prev_side is None or prev_side == new_side:
            return None

        # Cruzamento confirmado: saiu da zona morta no lado oposto
        return "out" if (prev_side == -1 and new_side == 1) else "in"

    def cleanup_stale_tracks(self, active_ids: set[int]) -> None:
        for tid in list(self._side):
            if tid not in active_ids:
                del self._side[tid]


# ─── PeopleCounter ────────────────────────────────────────────────────────────

_EVIDENCE_INTERVAL_S = 60.0   # máx 1 frame de evidência por câmera por minuto
_SAMPLE_EVERY = 5             # processa 1 frame a cada N (≈5fps a 25fps)
_CONFIDENCE = 0.35            # threshold YOLO: mais baixo = melhor recall em meia-luz
_NMS_SCORE = 0.35             # threshold NMS
_NMS_IOU = 0.4                # supressão de caixas sobrepostas


class PeopleCounter:
    def __init__(
        self,
        camera: Camera,
        on_event: Callable[[CountEvent], None],
        initial_people_inside: int = 0,
    ) -> None:
        self._camera = camera
        self._on_event = on_event
        # Inicia a partir do último estado salvo no DB (sobrevive a reinicializações)
        self._count_in = max(0, initial_people_inside)
        self._count_out = 0
        self._last_inference: Optional[datetime.datetime] = None
        self._last_evidence_at: float = 0.0
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
        logger.info("people counter started: camera=%s initial=%d", self._camera.id, self._count_in)

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
            import onnxruntime as ort
        except ImportError as exc:
            logger.error("missing dependency: %s", exc)
            return

        import os
        model_path = os.environ.get("YOLO_MODEL_PATH", "yolov8n.onnx")
        session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        input_name = session.get_inputs()[0].name

        tracker = SORTTracker(max_age=5, min_hits=2, iou_threshold=0.25)
        detector = LineCrossDetector(
            line_y=self._camera.line_y,
            frame_height=480,
            hysteresis_px=15.0,
        )
        cap = cv2.VideoCapture(self._camera.rtsp_url)

        if not cap.isOpened():
            logger.error("cannot open RTSP stream: %s", self._camera.id)
            cap.release()
            return

        frame_count = 0

        while self._running:
            ret, frame = cap.read()
            if not ret:
                logger.warning("camera %s lost, reconnecting in 5s...", self._camera.id)
                cap.release()
                self._stop_event.wait(5)
                cap = cv2.VideoCapture(self._camera.rtsp_url)
                continue

            frame_count += 1
            if frame_count % _SAMPLE_EVERY != 0:
                continue

            h, w = frame.shape[:2]
            detector.set_frame_height(h)

            # Pré-processa para 640×640 (formato YOLOv8)
            img = cv2.resize(frame, (640, 640))
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            img = np.transpose(img, (2, 0, 1))[np.newaxis]

            raw = session.run(None, {input_name: img})[0][0].T  # (8400, 84)
            person_scores = raw[:, 4]
            mask = person_scores > _CONFIDENCE
            boxes_raw = raw[mask, :4]
            scores_f = person_scores[mask]

            self._last_inference = datetime.datetime.now(datetime.timezone.utc)

            detections: list[tuple] = []
            if len(boxes_raw):
                cx_arr, cy_arr = boxes_raw[:, 0], boxes_raw[:, 1]
                bw_arr, bh_arr = boxes_raw[:, 2], boxes_raw[:, 3]
                x1 = (cx_arr - bw_arr / 2) / 640 * w
                y1 = (cy_arr - bh_arr / 2) / 640 * h
                x2 = (cx_arr + bw_arr / 2) / 640 * w
                y2 = (cy_arr + bh_arr / 2) / 640 * h

                nms_boxes = [
                    [float(x1[i]), float(y1[i]), float(x2[i] - x1[i]), float(y2[i] - y1[i])]
                    for i in range(len(x1))
                ]
                indices = cv2.dnn.NMSBoxes(nms_boxes, scores_f.tolist(), _NMS_SCORE, _NMS_IOU)
                for i in (indices.flatten() if len(indices) else []):
                    detections.append((float(x1[i]), float(y1[i]), float(x2[i]), float(y2[i])))

            confirmed_tracks = tracker.update(detections)

            for track in confirmed_tracks:
                direction = detector.update_track(track)
                if direction == "in":
                    self._count_in += 1
                    logger.debug("camera=%s IN  total_inside=%d", self._camera.id,
                                 max(0, self._count_in - self._count_out))
                    self._emit(frame)
                elif direction == "out":
                    self._count_out += 1
                    logger.debug("camera=%s OUT total_inside=%d", self._camera.id,
                                 max(0, self._count_in - self._count_out))
                    self._emit(frame)

            detector.cleanup_stale_tracks(tracker.all_ids())

        cap.release()
        logger.info("people counter stopped: camera=%s", self._camera.id)

    def _emit(self, frame: Optional[np.ndarray] = None) -> None:
        now_mono = time.monotonic()
        capture_evidence = (
            frame is not None
            and now_mono - self._last_evidence_at >= _EVIDENCE_INTERVAL_S
        )
        if capture_evidence:
            self._last_evidence_at = now_mono

        event = CountEvent(
            camera_id=self._camera.id,
            count_in=self._count_in,
            count_out=self._count_out,
            people_inside=max(0, self._count_in - self._count_out),
            recorded_at=datetime.datetime.now(datetime.timezone.utc),
            evidence_b64=frame_to_b64(frame) if capture_evidence else None,
        )
        self._on_event(event)
