# agent/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Dependências do sistema para OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender-dev ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-baixa o modelo YOLOv8-nano (evita download em produção)
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]
