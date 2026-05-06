# agent/models.py
from __future__ import annotations
import datetime
from dataclasses import dataclass
from typing import Optional

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
        return f"rtsp://{self.user}:{self.password}@{self.ip}{self.rtsp_path}"

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

    @property
    def counting_cameras(self) -> list[Camera]:
        return [c for c in self.cameras if c.role == "counting"]

    @staticmethod
    def from_dict(d: dict) -> AgentConfig:
        return AgentConfig(
            agent_id=d["agent_id"],
            name=d["name"],
            cameras=[Camera.from_dict(c) for c in d.get("cameras", [])],
            thresholds=d.get("thresholds", {}),
            heartbeat_interval=int(d.get("heartbeat_interval", 300)),
            webhook_token=d["webhook_token"],
            supabase_url=d.get("supabase_url", ""),
            config_changed_at=d.get("config_changed_at", ""),
        )

@dataclass
class CountEvent:
    camera_id: str
    count_in: int
    count_out: int
    people_inside: int
    recorded_at: datetime.datetime

    def to_dict(self) -> dict:
        return {
            "camera_id":     self.camera_id,
            "count_in":      self.count_in,
            "count_out":     self.count_out,
            "people_inside": self.people_inside,
            "recorded_at":   self.recorded_at.isoformat() + "Z",
        }

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
            "last_inference":        self.last_inference.isoformat() + "Z" if self.last_inference else None,
            "last_config_changed_at": self.last_config_changed_at,
        }
