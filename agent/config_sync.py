# agent/config_sync.py
import logging
import httpx
from agent.models import AgentConfig

logger = logging.getLogger(__name__)

class ConfigSync:
    def __init__(self, token: str, supabase_url: str, anon_key: str = ""):
        self._token = token
        self._anon_key = anon_key
        self._url = f"{supabase_url.rstrip('/')}/functions/v1/agent-config"

    def fetch(self) -> AgentConfig:
        response = httpx.get(
            self._url,
            headers={
                "apikey": self._anon_key,
                "Authorization": f"Bearer {self._token}",
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        logger.info("config fetched: agent_id=%s cameras=%d",
                    data.get("agent_id"), len(data.get("cameras", [])))
        return AgentConfig.from_dict(data)
