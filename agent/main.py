# agent/main.py
"""
Olho Vivo Agent — entry point.

Token (produção Windows):
  Incorporado ao nome do executável: *TOKEN_<id>.exe* (o cliente não digita nem vê arquivos de token).
  Persistido em .olhovivo.env no diretório do executável quando detectado no nome.

Modo desenvolvedor:
  ESTABLISHMENT_TOKEN — variável de ambiente
  token.txt — legado na pasta do agente
  SUPABASE_URL — sobrescreve a URL padrão (opcional)
  AGENT_VERSION — versão (default: 0.1.0)
  YOLO_MODEL_PATH — modelo YOLO ONNX (default: resolve yolov8n.onnx no bundle PyInstaller)
"""
from __future__ import annotations

import logging
import os
import sys
import time
import threading
from agent.config_sync import ConfigSync
from agent.scanner import discover_cameras, report_discovered
from agent.event_publisher import EventPublisher
from agent.heartbeat import HeartbeatSender
from agent.people_counter import PeopleCounter
from agent.models import AgentConfig
from agent.token_from_name import extract_token_from_executable_name

logger = logging.getLogger("agent.main")

VERSION = os.getenv("AGENT_VERSION", "0.1.0")
_DEFAULT_SUPABASE_URL = "https://uoxcwvjtsebwmbsmyszj.supabase.co"

_INTERNAL_ENV_NAME = ".olhovivo.env"
_LOG_FILE_NAME = "agente.log"
_RUN_VALUE_NAME = "OlhoVivoAgent"
_SCAN_DONE_FILE = ".scan_done"
_MIN_SCAN_INTERVAL = 300.0  # seconds between scans triggered by request_scan

# Shared scanner state
_last_scan_time: float = 0.0
_scan_lock = threading.Lock()


def _exe_dir() -> str:
    """Diretório do executável (funciona com PyInstaller e Python normal)."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def _frozen_yolo_onnx_path() -> str:
    """
    Caminho do yolov8n.onnx no build congelado.
    PyInstaller 6+ (onedir) coloca datas em _internal/; onefile usa sys._MEIPASS.
    """
    exe_d = _exe_dir()
    meipass = getattr(sys, "_MEIPASS", None)
    for base in (meipass, exe_d, os.path.join(exe_d, "_internal")):
        if not base:
            continue
        p = os.path.join(base, "yolov8n.onnx")
        if os.path.isfile(p):
            return p
    return os.path.join(exe_d, "yolov8n.onnx")


def _writable_data_dir() -> str:
    """
    Em Windows com .exe empacotado, logs, fila e .env ficam em %LOCALAPPDATA%\\OlhoVivoAgent\\
    (evita depender de escrita ao lado do binário em pastas de instalação).
    """
    if getattr(sys, "frozen", False) and sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or _exe_dir()
        path = os.path.join(base, "OlhoVivoAgent")
        try:
            os.makedirs(path, exist_ok=True)
        except OSError:
            return _exe_dir()
        return path
    return _exe_dir()


def _internal_env_path() -> str:
    return os.path.join(_writable_data_dir(), _INTERNAL_ENV_NAME)


def _read_internal_env() -> dict[str, str]:
    path = _internal_env_path()
    if not os.path.exists(path):
        return {}
    out: dict[str, str] = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                k = key.strip()
                v = val.strip().strip('"').strip("'")
                if k:
                    out[k] = v
    except OSError as exc:
        logger.warning("could not read %s: %s", path, exc)
    return out


def _persist_token_to_internal_env(token: str) -> None:
    """Escreve/atualiza ESTABLISHMENT_TOKEN preservando outras chaves existentes."""
    path = _internal_env_path()
    existing = _read_internal_env()
    existing["ESTABLISHMENT_TOKEN"] = token
    try:
        with open(path, "w", encoding="utf-8") as f:
            for k, v in existing.items():
                f.write(f"{k}={v}\n")
    except OSError as exc:
        logger.warning("could not persist token to %s: %s", path, exc)


def configure_logging() -> None:
    """Logs em agente.log; em Windows congelado sem console, só arquivo."""
    log_path = os.path.join(_writable_data_dir(), _LOG_FILE_NAME)
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(fmt)
    root.addHandler(fh)

    frozen_win = getattr(sys, "frozen", False) and sys.platform == "win32"
    if not frozen_win:
        sh = logging.StreamHandler(sys.stderr)
        sh.setFormatter(fmt)
        root.addHandler(sh)


def ensure_autostart_windows() -> None:
    """Registra o agente em HKCU\\...\\Run (somente Windows, build congelada)."""
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    try:
        import winreg  # noqa: PLC0415 — só no Windows em runtime
    except ImportError:
        return

    exe = os.path.abspath(sys.executable)
    value = f'"{exe}"' if " " in exe else exe
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE,
        )
        try:
            winreg.SetValueEx(key, _RUN_VALUE_NAME, 0, winreg.REG_SZ, value)
        finally:
            key.Close()
        logger.info("autostart registry updated")
    except OSError as exc:
        logger.warning("autostart registry failed: %s", exc)


def _scan_done_path() -> str:
    return os.path.join(_writable_data_dir(), _SCAN_DONE_FILE)


def _is_first_boot() -> bool:
    return not os.path.exists(_scan_done_path())


def _mark_scan_done() -> None:
    try:
        with open(_scan_done_path(), "w", encoding="utf-8") as f:
            f.write("")
    except OSError as exc:
        logger.debug("could not write scan-done marker: %s", exc)


def _launch_scan(configured_ips: set[str], token: str, supabase_url: str, anon_key: str = "") -> None:
    """
    Dispara o scanner de câmeras em uma thread daemon.
    Aplica debounce de _MIN_SCAN_INTERVAL para evitar scans repetidos.
    """
    global _last_scan_time
    with _scan_lock:
        now = time.time()
        if now - _last_scan_time < _MIN_SCAN_INTERVAL:
            logger.debug("scan skipped: last ran %.0fs ago", now - _last_scan_time)
            return
        _last_scan_time = now

    def _run() -> None:
        candidates = discover_cameras(timeout=5.0)
        new = [c for c in candidates if c["ip"] not in configured_ips]
        if new:
            report_discovered(new, token=token, supabase_url=supabase_url, anon_key=anon_key)
        _mark_scan_done()

    threading.Thread(target=_run, daemon=True, name="camera-scanner").start()


def load_token() -> str:
    token = os.getenv("ESTABLISHMENT_TOKEN")
    if token and token.strip():
        return token.strip()

    from_name = extract_token_from_executable_name()
    if from_name:
        _persist_token_to_internal_env(from_name)
        return from_name

    internal = _read_internal_env().get("ESTABLISHMENT_TOKEN")
    if internal and internal.strip():
        return internal.strip()

    token_file = os.getenv("TOKEN_FILE")
    if not token_file:
        cand_w = os.path.join(_writable_data_dir(), "token.txt")
        cand_e = os.path.join(_exe_dir(), "token.txt")
        token_file = cand_w if os.path.exists(cand_w) else cand_e
    if os.path.exists(token_file):
        with open(token_file, encoding="utf-8") as f:
            value = f.read().strip()
        if value:
            return value

    raise RuntimeError(
        "Token do agente não encontrado. Use o link de instalação do painel Olho Vivo "
        "ou defina ESTABLISHMENT_TOKEN para desenvolvimento."
    )


def main() -> None:
    configure_logging()
    ensure_autostart_windows()

    if getattr(sys, "frozen", False):
        os.environ.setdefault("YOLO_MODEL_PATH", _frozen_yolo_onnx_path())

    supabase_url = os.getenv("SUPABASE_URL", _DEFAULT_SUPABASE_URL).rstrip("/")
    _internal = _read_internal_env()
    anon_key = os.getenv("SUPABASE_ANON_KEY") or _internal.get("SUPABASE_ANON_KEY", "")

    token = load_token()
    logger.info("agent starting v%s", VERSION)

    if not anon_key:
        logger.warning("SUPABASE_ANON_KEY não definida — requisições ao Supabase podem falhar com 401")

    # 1. Busca configuração inicial
    sync = ConfigSync(token=token, supabase_url=supabase_url, anon_key=anon_key)
    config: AgentConfig = sync.fetch()
    logger.info("config loaded: agent=%s cameras=%d", config.name, len(config.cameras))

    # 2. Etapa 4: disparo automático no primeiro boot
    if _is_first_boot():
        logger.info("first boot — launching camera scan")
        _launch_scan({c.ip for c in config.cameras}, token, supabase_url, anon_key)
    elif config.request_scan:
        logger.info("request_scan set in config — launching camera scan")
        _launch_scan({c.ip for c in config.cameras}, token, supabase_url, anon_key)

    # 3. Publisher de eventos
    queue_path = os.path.join(_writable_data_dir(), "queue.db")
    publisher = EventPublisher(
        webhook_url=f"{supabase_url}/functions/v1/webhook-camera",
        webhook_token=config.webhook_token,
        db_path=queue_path,
        anon_key=anon_key,
    )

    # 4. Heartbeat sender
    heartbeat = HeartbeatSender(
        token=token,
        supabase_url=supabase_url,
        version=VERSION,
        last_config_changed_at=config.config_changed_at,
        anon_key=anon_key,
    )

    # 5. Inicia contadores por câmera, restaurando o estado salvo no DB
    counters: list[PeopleCounter] = []
    for camera in config.counting_cameras:
        initial = config.camera_states.get(camera.id, 0)
        if initial > 0:
            logger.info("camera %s: restoring people_inside=%d from DB", camera.id, initial)
        counter = PeopleCounter(
            camera=camera,
            on_event=publisher.publish,
            initial_people_inside=initial,
        )
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
                        db_path=queue_path,
                        anon_key=anon_key,
                    )
                    heartbeat_interval = config.heartbeat_interval
                    heartbeat.update_config_changed_at(config.config_changed_at)
                    for camera in config.counting_cameras:
                        initial = config.camera_states.get(camera.id, 0)
                        counter = PeopleCounter(
                            camera=camera,
                            on_event=publisher.publish,
                            initial_people_inside=initial,
                        )
                        counter.start()
                        counters.append(counter)
                    logger.info("config reloaded: cameras=%d", len(counters))

                    # Etapa 4: command remoto via request_scan no agent_config
                    if config.request_scan:
                        logger.info("request_scan flagged after reload — launching camera scan")
                        _launch_scan({c.ip for c in config.cameras}, token, supabase_url, anon_key)

                except Exception as exc:
                    logger.error("re-sync failed: %s", exc)

            # Etapa 4: request_scan pode vir direto na resposta do heartbeat
            elif result.get("request_scan"):
                logger.info("request_scan received via heartbeat — launching camera scan")
                _launch_scan({c.ip for c in config.cameras}, token, supabase_url, anon_key)

    except KeyboardInterrupt:
        logger.info("agent stopping")
        for c in counters:
            c.stop()
        publisher.close()


if __name__ == "__main__":
    main()
