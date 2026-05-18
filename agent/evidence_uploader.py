# agent/evidence_uploader.py
"""
Captura um frame BGR (numpy array do OpenCV) e retorna como string base64 JPEG.
Resolução reduzida + compressão para manter o payload do webhook abaixo de ~60 KB.
Retorna None em qualquer erro — o evento é publicado normalmente sem evidência.
"""
from __future__ import annotations

import base64
import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    import numpy as np

logger = logging.getLogger(__name__)

_MAX_SIDE   = 640    # px — lado máximo após redimensionamento
_JPEG_QUAL  = 65     # qualidade JPEG (0-100); menor custo de storage/bandwidth


def frame_to_b64(frame: "np.ndarray") -> Optional[str]:
    """
    Redimensiona e codifica um frame BGR em JPEG base64.
    Seguro para chamar de qualquer thread — sem estado global.
    """
    try:
        import cv2
        import numpy as np  # noqa: F401 — confirma que está disponível

        h, w = frame.shape[:2]
        if h == 0 or w == 0:
            return None

        # Redimensiona mantendo proporção
        scale = min(_MAX_SIDE / w, _MAX_SIDE / h)
        if scale < 1.0:
            new_w, new_h = int(w * scale), int(h * scale)
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

        ok, buf = cv2.imencode(
            ".jpg", frame,
            [cv2.IMWRITE_JPEG_QUALITY, _JPEG_QUAL]
        )
        if not ok:
            return None

        return base64.b64encode(buf.tobytes()).decode("ascii")

    except Exception as exc:
        logger.debug("evidence capture failed: %s", exc)
        return None
