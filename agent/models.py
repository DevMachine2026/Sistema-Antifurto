# agent/models.py
from __future__ import annotations
import datetime
import logging
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote

logger = logging.getLogger(__name__)


def _to_utc_iso(dt: datetime.datetime) -> str:
    """Normalize a datetime to UTC and return a Z-suffixed ISO 8601 string.

    Handles both naive datetimes (assumed UTC) and timezone-aware datetimes.
    """
    if dt.tzinfo is not None:
        # Convert to UTC and strip tzinfo so isoformat() never emits +00:00
        dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"


@dataclass
class Camera:
    id: str
    ip: str
    user: str
    password: str
    role: str          # "counting" | "cash"
    name: str
    line_y: float      # 0.0–1.0, posição vertical da linha de contagem
    rtsp_path: str

    @property
    def rtsp_url(self) -> str:
        return f"rtsp://{quote(self.user, safe='')}:{quote(self.password, safe='')}@{self.ip}{self.rtsp_path}"

    @staticmethod
    def from_dict(d: dict) -> Camera:
        return Camera(
            id=d["id"],
            ip=d["ip"],
            user=d["user"],
            password=d["pass"],
            role=d.get("role", "counting"),
            name=d.get("name", d["id"]),
            line_y=float(d.get("line_y", 0.5)),
            rtsp_path=d.get("rtsp_path", "/stream1"),
        )

@dataclass
class AgentConfig:
    agent_id: str
    name: str
    cameras: list[Camera]
    thresholds: dict
    heartbeat_interval: int
    webhook_token: str
    supabase_url: str
    config_changed_at: str  # ISO timestamp — enviado no heartbeat como last_config_changed_at
    request_scan: bool = False  # sinaliza que o backend quer um novo scan de câmeras

    @property
    def counting_cameras(self) -> list[Camera]:
        return [c for c in self.cameras if c.role == "counting"]

    @staticmethod
    def from_dict(d: dict) -> AgentConfig:
        cameras = []
        for c in d.get("cameras", []):
            try:
                cameras.append(Camera.from_dict(c))
            except (KeyError, ValueError, TypeError) as e:
                logger.error("skipping malformed camera %r: %s", c.get("id", "?"), e)
        return AgentConfig(
            agent_id=d["agent_id"],
            name=d["name"],
            cameras=cameras,
            thresholds=d.get("thresholds", {}),
            heartbeat_interval=int(d.get("heartbeat_interval", 300)),
            webhook_token=d["webhook_token"],
            supabase_url=d.get("supabase_url", ""),
            config_changed_at=d.get("config_changed_at", ""),
            request_scan=bool(d.get("request_scan", False)),
        )

@dataclass
class CountEvent:
    camera_id: str
    count_in: int
    count_out: int
    people_inside: int
    recorded_at: datetime.datetime
    evidence_b64: Optional[str] = None  # JPEG base64 do frame no momento da detecção

    def to_dict(self) -> dict:
        d: dict = {
            "camera_id":     self.camera_id,
            "count_in":      self.count_in,
            "count_out":     self.count_out,
            "people_inside": self.people_inside,
            "recorded_at":   _to_utc_iso(self.recorded_at),
        }
        if self.evidence_b64:
            d["evidence_image"] = self.evidence_b64
        return d

@dataclass
class HeartbeatPayload:
    version: str
    cameras_online: int
    last_inference: Optional[datetime.datetime]
    last_config_changed_at: str  # ISO string — valor recebido da última config sync

    def to_dict(self) -> dict:
        return {
            "version":               self.version,
            "cameras_online":        self.cameras_online,
            "last_inference":        _to_utc_iso(self.last_inference) if self.last_inference else None,
            "last_config_changed_at": self.last_config_changed_at,
        }
