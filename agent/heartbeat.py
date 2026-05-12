# agent/heartbeat.py
import logging
import datetime
import httpx
from typing import Optional
from agent.models import HeartbeatPayload

logger = logging.getLogger(__name__)

class HeartbeatSender:
    VERSION = "0.1.0"

    def __init__(self, token: str, supabase_url: str, version: str = VERSION,
                 last_config_changed_at: str = "", anon_key: str = ""):
        self._token = token
        self._anon_key = anon_key
        self._url = f"{supabase_url.rstrip('/')}/functions/v1/agent-heartbeat"
        self._version = version
        self._last_config_changed_at: str = last_config_changed_at

    def update_config_changed_at(self, value: str) -> None:
        self._last_config_changed_at = value

    def send(self, cameras_online: int, last_inference: Optional[datetime.datetime]) -> dict:
        payload_obj = HeartbeatPayload(
            version=self._version,
            cameras_online=cameras_online,
            last_inference=last_inference,
            last_config_changed_at=self._last_config_changed_at,
        )
        payload = payload_obj.to_dict()
        payload["establishment_token"] = self._token
        try:
            resp = httpx.post(
                self._url,
                json=payload,
                headers={
                    "apikey": self._anon_key,
                    "Authorization": f"Bearer {self._token}",
                },
                timeout=10,
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info("heartbeat sent: cameras_online=%d config_updated=%s",
                        cameras_online, result.get("config_updated"))
            return result
        except Exception as exc:
            logger.warning("heartbeat failed (non-critical): %s", exc)
            return {}
