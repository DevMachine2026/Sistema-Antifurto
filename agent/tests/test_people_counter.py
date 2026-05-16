# agent/tests/test_people_counter.py
#
# LineCrossDetector agora recebe um KalmanBoxTracker.
# Usamos FakeTrack para isolar a lógica sem depender da câmera.
#
# Configuração dos testes:
#   line_y=0.5, frame_height=100 → line_px = 50
#   hysteresis_px = 15  → above_zone = cy < 35, below_zone = cy > 65
#   Centroid_y válido: ≤ 30 (acima) ou ≥ 70 (abaixo)

from agent.people_counter import LineCrossDetector


class FakeTrack:
    """Track stub com centroid e velocidade configuráveis."""

    def __init__(self, track_id: int, cx: float, cy: float, vx: float = 0.0, vy: float = 10.0):
        self.id = track_id
        self._cx = cx
        self._cy = cy
        self._vx = vx
        self._vy = vy

    @property
    def centroid(self) -> tuple[float, float]:
        return self._cx, self._cy

    @property
    def velocity(self) -> tuple[float, float]:
        return self._vx, self._vy


def _det(line_y=0.5, frame_height=100):
    return LineCrossDetector(line_y=line_y, frame_height=frame_height, hysteresis_px=15.0)


def test_no_crossing_same_side():
    det = _det()
    det.update_track(FakeTrack(1, 50, 20))   # acima (cy=20 < 35)
    direction = det.update_track(FakeTrack(1, 50, 28))  # ainda acima
    assert direction is None


def test_crossing_downward_is_out():
    det = _det()
    det.update_track(FakeTrack(1, 50, 20))   # acima da zona morta (cy < 35)
    direction = det.update_track(FakeTrack(1, 50, 70))  # abaixo da zona morta (cy > 65)
    assert direction == "out"


def test_crossing_upward_is_in():
    det = _det()
    det.update_track(FakeTrack(1, 50, 70))   # abaixo da zona morta
    direction = det.update_track(FakeTrack(1, 50, 20))  # acima da zona morta
    assert direction == "in"


def test_multiple_tracks_independent():
    det = _det()
    det.update_track(FakeTrack(1, 50, 20))   # track 1 acima
    det.update_track(FakeTrack(2, 50, 70))   # track 2 abaixo
    d1 = det.update_track(FakeTrack(1, 50, 70))  # track 1 cruza para baixo → out
    d2 = det.update_track(FakeTrack(2, 50, 20))  # track 2 cruza para cima  → in
    assert d1 == "out"
    assert d2 == "in"


def test_first_detection_never_crosses():
    det = _det()
    # Primeira aparição de um track não gera cruzamento
    direction = det.update_track(FakeTrack(99, 50, 70))
    assert direction is None


def test_dead_zone_no_crossing():
    det = _det()
    det.update_track(FakeTrack(1, 50, 20))   # acima
    # Entra na zona morta — não deve contar
    direction = det.update_track(FakeTrack(1, 50, 50))  # zona morta (35..65)
    assert direction is None


def test_direction_filter_rejects_lateral_movement():
    det = _det()
    det.update_track(FakeTrack(1, 50, 20))
    # vx grande e vy pequeno → movimento lateral → não conta
    direction = det.update_track(FakeTrack(1, 50, 70, vx=50.0, vy=1.0))
    assert direction is None


def test_cleanup_stale_tracks():
    det = _det()
    det.update_track(FakeTrack(1, 50, 20))   # track 1 acima
    det.cleanup_stale_tracks(active_ids={2, 3})  # remove track 1
    # Após remoção, track 1 reaparece abaixo — não deve cruzar (sem estado anterior)
    direction = det.update_track(FakeTrack(1, 50, 70))
    assert direction is None
