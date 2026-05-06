"""
Teste rápido com webcam — sem janela de vídeo.
Imprime no terminal cada vez que alguém cruza a linha virtual.

Uso:
  PYTHONPATH=/mnt/hd/sistema-antifraude \
  agent/.venv/bin/python agent/test_webcam.py

Pressione Ctrl+C para parar.
"""
import sys
import cv2
from ultralytics import YOLO
from agent.people_counter import LineCrossDetector

LINE_Y = 0.5        # linha no meio da imagem
SAMPLE_EVERY = 5    # processa 1 a cada 5 frames

model = YOLO("yolov8n.pt")
detector = LineCrossDetector(line_y=LINE_Y, frame_height=480)

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("ERRO: webcam não encontrada (device 0)")
    sys.exit(1)

count_in = 0
count_out = 0
frame_count = 0

print("Webcam aberta. Passe na frente da câmera cruzando a linha do meio.")
print("Ctrl+C para parar.\n")

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            print("ERRO: falha ao ler frame da webcam")
            break

        frame_count += 1
        if frame_count % SAMPLE_EVERY != 0:
            continue

        h = frame.shape[0]
        detector.set_frame_height(h)

        results = model.track(frame, persist=True, classes=[0], verbose=False, stream=False)

        active_ids: set[int] = set()
        for result in results:
            if result.boxes is None or result.boxes.id is None:
                continue
            for box, track_id in zip(result.boxes.xyxy, result.boxes.id):
                tid = int(track_id.item())
                active_ids.add(tid)
                x1, y1, x2, y2 = box.tolist()
                centroid_y = (y1 + y2) / 2

                direction = detector.update_track(tid, centroid_y)
                if direction == "in":
                    count_in += 1
                    inside = max(0, count_in - count_out)
                    print(f"← ENTROU  |  dentro={inside}  in={count_in}  out={count_out}")
                elif direction == "out":
                    count_out += 1
                    inside = max(0, count_in - count_out)
                    print(f"→ SAIU    |  dentro={inside}  in={count_in}  out={count_out}")

        detector.cleanup_stale_tracks(active_ids)

except KeyboardInterrupt:
    pass
finally:
    cap.release()
    print(f"\nFinalizado — IN={count_in}  OUT={count_out}  Dentro={max(0, count_in - count_out)}")
