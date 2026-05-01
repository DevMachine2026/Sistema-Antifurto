#!/usr/bin/env python3
"""
Olho Vivo — Webcam Test Client
Detecta pessoas via HOG (OpenCV) e envia eventos para o webhook-camera.

Dependências:
    pip install opencv-python requests

Uso:
    python webcam_test.py \
        --url  https://<ref>.supabase.co/functions/v1/webhook-camera \
        --token SEU_TOKEN_DO_APP \
        [--camera-id cam-area-01] \
        [--interval 10] \
        [--device 0]

Controles na janela de vídeo:
    q  — encerra
    s  — envia evento manualmente agora
"""

import argparse
import datetime
import time

import cv2
import requests


def send_webhook(url: str, token: str, camera_id: str,
                 count_in: int, count_out: int, people_inside: int):
    payload = {
        "camera_id": camera_id,
        "count_in": count_in,
        "count_out": count_out,
        "people_inside": people_inside,
        "recorded_at": datetime.datetime.utcnow().isoformat() + "Z",
    }
    try:
        r = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        return r.status_code, r.json()
    except Exception as exc:
        return None, str(exc)


def draw_overlay(frame, people: int, remaining: int, camera_id: str, last_status: str):
    h = frame.shape[0]
    cv2.putText(frame, f"Pessoas detectadas: {people}",
                (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 220, 100), 2)
    cv2.putText(frame, f"Proximo envio em: {remaining}s  |  [s] enviar agora  |  [q] sair",
                (10, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
    cv2.putText(frame, f"cam: {camera_id}",
                (10, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 100, 255), 1)
    if last_status:
        color = (0, 220, 100) if last_status.startswith("OK") else (0, 60, 240)
        cv2.putText(frame, last_status,
                    (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)


def main():
    parser = argparse.ArgumentParser(description="Olho Vivo — Webcam Test Client")
    parser.add_argument("--url",       required=True, help="URL do webhook-camera")
    parser.add_argument("--token",     required=True, help="Bearer token do estabelecimento")
    parser.add_argument("--camera-id", default="cam-area-01",
                        help="ID da câmera (padrão: cam-area-01)")
    parser.add_argument("--interval",  type=int, default=10,
                        help="Intervalo entre envios automáticos em segundos (padrão: 10)")
    parser.add_argument("--device",    type=int, default=0,
                        help="Índice da webcam (padrão: 0)")
    args = parser.parse_args()

    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    cap = cv2.VideoCapture(args.device)
    if not cap.isOpened():
        print(f"Erro: não foi possível abrir o dispositivo {args.device}.")
        return

    print(f"Webcam aberta (device={args.device})")
    print(f"Endpoint : {args.url}")
    print(f"Camera ID: {args.camera_id}")
    print(f"Intervalo: {args.interval}s")
    print("Pressione 'q' para encerrar, 's' para enviar imediatamente.")

    last_send = 0.0
    prev_count = 0
    total_in = 0
    total_out = 0
    last_status = ""

    def do_send(people: int):
        nonlocal prev_count, total_in, total_out, last_send, last_status
        delta = people - prev_count
        c_in  = max(0,  delta)
        c_out = max(0, -delta)
        total_in  += c_in
        total_out += c_out
        status, resp = send_webhook(
            args.url, args.token, args.camera_id,
            c_in, c_out, people,
        )
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        if status == 200:
            dedup = resp.get("deduplicated", False)
            last_status = f"OK [{ts}] {people} pessoas | dedup={dedup}"
            print(f"[{ts}] ✓ pessoas={people} in={c_in} out={c_out} dedup={dedup}")
        else:
            last_status = f"ERRO [{ts}] status={status}"
            print(f"[{ts}] ✗ status={status} resp={resp}")
        prev_count = people
        last_send = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Erro: frame não capturado.")
            break

        # Detecção HOG — reduz frame para ganhar velocidade
        small = cv2.resize(frame, (640, 480))
        boxes, _ = hog.detectMultiScale(
            small, winStride=(8, 8), padding=(4, 4), scale=1.05,
        )
        scale_x = frame.shape[1] / 640
        scale_y = frame.shape[0] / 480
        for (x, y, w, h) in boxes:
            cv2.rectangle(frame,
                          (int(x * scale_x), int(y * scale_y)),
                          (int((x + w) * scale_x), int((y + h) * scale_y)),
                          (0, 200, 100), 2)

        people = len(boxes)
        now = time.time()
        remaining = max(0, args.interval - int(now - last_send))
        draw_overlay(frame, people, remaining, args.camera_id, last_status)
        cv2.imshow("Olho Vivo — Webcam Test", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("s"):
            do_send(people)
        elif now - last_send >= args.interval:
            do_send(people)

    cap.release()
    cv2.destroyAllWindows()
    print(f"\nEncerrado. Total entradas={total_in} saídas={total_out}")


if __name__ == "__main__":
    main()
