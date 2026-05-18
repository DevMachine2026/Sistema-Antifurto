"""Sessão ONNX compartilhada — evita N× memória em multi-câmera."""
from __future__ import annotations

import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_session = None
_input_name: Optional[str] = None


def get_yolo_session():
    global _session, _input_name
    with _lock:
        if _session is not None:
            return _session, _input_name
        import onnxruntime as ort

        model_path = os.environ.get("YOLO_MODEL_PATH", "yolov8n.onnx")
        _session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        _input_name = _session.get_inputs()[0].name
        logger.info("shared YOLO session loaded: %s", model_path)
        return _session, _input_name
