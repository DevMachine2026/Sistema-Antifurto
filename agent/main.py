# agent/main.py
"""
Olho Vivo Agent — entry point.

Modo normal (executável distribuído):
  Crie um arquivo token.txt na mesma pasta do executável com o token do AdminPanel.

Modo desenvolvedor (variáveis de ambiente):
  ESTABLISHMENT_TOKEN — token único do agente
  SUPABASE_URL        — sobrescreve a URL padrão do Supabase (opcional)
  AGENT_VERSION       — versão do agente (default: 0.1.0)
  YOLO_MODEL_PATH     — path do modelo YOLO (default: yolov8n.pt)
"""
import logging
import os
import sys
import time
import threading
from typing import Optional

from agent.config_sync import ConfigSync
from agent.camera_discovery import discover_cameras, report_discovered
from agent.event_publisher import EventPublisher
from agent.heartbeat import HeartbeatSender
from agent.people_counter import PeopleCounter
from agent.models import AgentConfig, CountEvent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("agent.main")

VERSION = os.getenv("AGENT_VERSION", "0.1.0")
_DEFAULT_SUPABASE_URL = "https://uoxcwvjtsebwmbsmyszj.supabase.co"


def _exe_dir() -> str:
    """Diretório do executável (funciona com PyInstaller e Python normal)."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def load_token() -> str:
    token = os.getenv("ESTABLISHMENT_TOKEN")
    if token:
        return token.strip()
    token_file = os.getenv("TOKEN_FILE") or os.path.join(_exe_dir(), "token.txt")
    if os.path.exists(token_file):
        with open(token_file) as f:
            value = f.read().strip()
        if value:
            return value
    raise RuntimeError(
        "Token não encontrado.\n"
        "Crie um arquivo token.txt na mesma pasta do agente com o token do AdminPanel."
    )


def main() -> None:
    supabase_url = os.getenv("SUPABASE_URL", _DEFAULT_SUPABASE_URL).rstrip("/")

    token = load_token()
    logger.info("agent starting v%s", VERSION)

    # 1. Busca configuração inicial
    sync = ConfigSync(token=token, supabase_url=supabase_url)
    config: AgentConfig = sync.fetch()
    logger.info("config loaded: agent=%s cameras=%d", config.name, len(config.cameras))

    # 2. ONVIF discovery em background
    def run_onvif():
        candidates = discover_cameras(timeout=5.0)
        configured_ips = {c.ip for c in config.cameras}
        new = [c for c in candidates if c["ip"] not in configured_ips]
        if new:
            report_discovered(new, token=token, supabase_url=supabase_url)

    threading.Thread(target=run_onvif, daemon=True, name="onvif-discovery").start()

    # 3. Publisher de eventos
    publisher = EventPublisher(
        webhook_url=f"{supabase_url}/functions/v1/webhook-camera",
        webhook_token=config.webhook_token,
        db_path="queue.db",
    )

    # 4. Heartbeat sender
    heartbeat = HeartbeatSender(
        token=token,
        supabase_url=supabase_url,
        version=VERSION,
        last_config_changed_at=config.config_changed_at,
    )

    # 5. Inicia contadores por câmera
    counters: list[PeopleCounter] = []
    for camera in config.counting_cameras:
        counter = PeopleCounter(camera=camera, on_event=publisher.publish)
        counter.start()
        counters.append(counter)

    if not counters:
        logger.warning("nenhuma câmera com role=counting — aguardando config via AdminPanel")

    # 6. Loop principal
    heartbeat_interval = config.heartbeat_interval

    try:
        while True:
            time.sleep(heartbeat_interval)

            publisher.flush_queue()

            last_inference = max(
                (c.last_inference for c in counters if c.last_inference),
                default=None,
            )
            result = heartbeat.send(
                cameras_online=sum(1 for c in counters if c.last_inference),
                last_inference=last_inference,
            )

            if result.get("config_updated"):
                logger.info("config updated remotely — reloading")
                try:
                    new_config = sync.fetch()
                    for c in counters:
                        c.stop()
                    counters.clear()
                    config = new_config
                    # Re-create publisher with new webhook_token
                    publisher.close()
                    publisher = EventPublisher(
                        webhook_url=f"{supabase_url}/functions/v1/webhook-camera",
                        webhook_token=config.webhook_token,
                        db_path="queue.db",
                    )
                    heartbeat_interval = config.heartbeat_interval
                    heartbeat.update_config_changed_at(config.config_changed_at)
                    for camera in config.counting_cameras:
                        counter = PeopleCounter(camera=camera, on_event=publisher.publish)
                        counter.start()
                        counters.append(counter)
                    logger.info("config reloaded: cameras=%d", len(counters))
                except Exception as exc:
                    logger.error("re-sync failed: %s", exc)

    except KeyboardInterrupt:
        logger.info("agent stopping")
        for c in counters:
            c.stop()
        publisher.close()


if __name__ == "__main__":
    main()
