# agent/camera_discovery.py
import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


def discover_cameras(timeout: float = 5.0) -> list[dict]:
    """
    Descobre câmeras via ONVIF WS-Discovery multicast.
    Retorna lista de {ip, name}.
    """
    try:
        from wsdiscovery import WSDiscovery, QName
    except ImportError:
        logger.warning("wsdiscovery not installed — ONVIF discovery skipped")
        return []

    wsd = WSDiscovery()
    wsd.start()
    services = wsd.searchServices(
        types=[QName("http://www.onvif.org/ver10/network/wsdl", "NetworkVideoTransmitter")],
        timeout=timeout,
    )
    wsd.stop()

    cameras = []
    for svc in services:
        addrs = svc.getXAddrs()
        if not addrs:
            continue
        ip = _extract_ip(addrs[0])
        if ip:
            name = svc.getScopes()[0].getValue() if svc.getScopes() else ip
            cameras.append({"ip": ip, "name": name})
            logger.info("ONVIF discovered: ip=%s name=%s", ip, name)

    return cameras


def _extract_ip(xaddr: str) -> Optional[str]:
    """Extrai IP de URL ONVIF (ex: http://192.168.1.10/onvif/device_service)."""
    try:
        from urllib.parse import urlparse
        return urlparse(xaddr).hostname
    except Exception:
        return None


def report_discovered(candidates: list[dict], token: str, supabase_url: str) -> None:
    """Envia câmeras descobertas para o Supabase para aprovação no AdminPanel."""
    if not candidates:
        return
    try:
        resp = httpx.post(
            f"{supabase_url.rstrip('/')}/functions/v1/agent-cameras-found",
            json={"cameras": candidates},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info("reported %d camera candidates (inserted=%s)",
                    len(candidates), data.get("inserted"))
    except Exception as exc:
        logger.warning("failed to report camera candidates: %s", exc)
