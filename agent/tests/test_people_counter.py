# agent/tests/test_people_counter.py
from agent.people_counter import LineCrossDetector

def test_no_crossing_same_side():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=30)
    direction = det.update_track(track_id=1, centroid_y=40)
    assert direction is None  # ainda acima da linha

def test_crossing_downward_is_out():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=45)   # acima da linha (linha=50)
    direction = det.update_track(track_id=1, centroid_y=55)  # abaixo da linha
    assert direction == "out"

def test_crossing_upward_is_in():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=60)   # abaixo da linha
    direction = det.update_track(track_id=1, centroid_y=40)  # acima da linha
    assert direction == "in"

def test_multiple_tracks_independent():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=40)
    det.update_track(track_id=2, centroid_y=60)
    # Track 1 cruza para baixo
    d1 = det.update_track(track_id=1, centroid_y=60)
    # Track 2 cruza para cima
    d2 = det.update_track(track_id=2, centroid_y=40)
    assert d1 == "out"
    assert d2 == "in"

def test_first_detection_never_crosses():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    # Primeira vez que um track aparece não conta como cruzamento
    direction = det.update_track(track_id=99, centroid_y=60)
    assert direction is None

def test_cleanup_stale_tracks():
    det = LineCrossDetector(line_y=0.5, frame_height=100)
    det.update_track(track_id=1, centroid_y=40)
    det.cleanup_stale_tracks(active_ids={2, 3})
    # Track 1 foi removido — nova detecção não cruza
    direction = det.update_track(track_id=1, centroid_y=60)
    assert direction is None
