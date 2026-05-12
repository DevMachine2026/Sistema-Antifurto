# agent/scanner.py
"""
Camera scanner: ONVIF WS-Discovery + port-scan fallback.
Pure-Python only — no system nmap required.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
import subprocess
import sys
import threading
from typing import Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Ports commonly used by IP cameras / DVRs
_CAMERA_PORTS = [554, 8000, 80, 37777]

# Port → manufacturer hint (last resort)
_PORT_HINTS: dict[int, str] = {
    37777: "Dahua",
    8000: "Hikvision",
}

_KNOWN_VENDORS = ("Hikvision", "Dahua", "Axis", "Hanwha", "Bosch", "Reolink", "Uniview", "Amcrest")


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------

def _arp_hosts() -> list[str]:
    """
    Read the OS ARP cache to get IPs of recently-active hosts.
    No admin privileges required; avoids a full /24 ping sweep.
    """
    try:
        cmd = ["arp", "-a"] if sys.platform == "win32" else ["arp", "-n"]
        out = subprocess.check_output(cmd, timeout=5, text=True, stderr=subprocess.DEVNULL)
    except Exception as exc:
        logger.debug("arp read failed: %s", exc)
        return []

    _IP_RE = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")
    seen: set[str] = set()
    hosts: list[str] = []
    for m in _IP_RE.finditer(out):
        ip = m.group(1)
        if ip in seen:
            continue
        seen.add(ip)
        if ip.endswith(".0") or ip.endswith(".255"):
            continue
        try:
            ipaddress.IPv4Address(ip)
            hosts.append(ip)
        except ValueError:
            pass
    return hosts


def _tcp_open(ip: str, port: int, timeout: float = 0.5) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except Exception:
        return False


def _guess_manufacturer(ip: str, port: int, service_url: str) -> Optional[str]:
    """
    Identify vendor via HTTP Server header; fall back to port-based hint.
    Only probes HTTP ports to avoid long timeouts on RTSP.
    """
    if port in (80, 8000):
        try:
            url = service_url if service_url.startswith("http") else f"http://{ip}:{port}/"
            resp = httpx.get(url, timeout=2.0, follow_redirects=False)
            server = resp.headers.get("server", "")
            for vendor in _KNOWN_VENDORS:
                if vendor.lower() in server.lower():
                    return vendor
            if server:
                return server.split("/")[0][:32]
        except Exception:
            pass
    return _PORT_HINTS.get(port)


# ---------------------------------------------------------------------------
# Etapa 1: ONVIF WS-Discovery
# ---------------------------------------------------------------------------

def discover_onvif(timeout: float = 5.0) -> list[dict]:
    """
    WS-Discovery multicast for ONVIF NetworkVideoTransmitters.
    Returns [{ip, port, service_url, manufacturer}].
    """
    try:
        from wsdiscovery import WSDiscovery, QName  # type: ignore[import]
    except ImportError:
        logger.warning("wsdiscovery not installed — ONVIF scan skipped")
        return []

    results: list[dict] = []
    try:
        wsd = WSDiscovery()
        wsd.start()
        services = wsd.searchServices(
            types=[QName("http://www.onvif.org/ver10/network/wsdl", "NetworkVideoTransmitter")],
            timeout=timeout,
        )
        wsd.stop()
    except Exception as exc:
        logger.warning("WS-Discovery error: %s", exc)
        return []

    for svc in services:
        addrs = svc.getXAddrs()
        if not addrs:
            continue
        service_url = addrs[0]
        parsed = urlparse(service_url)
        ip = parsed.hostname
        if not ip:
            continue
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        # Try to extract manufacturer from ONVIF scopes
        manufacturer: Optional[str] = None
        for scope in svc.getScopes():
            val = scope.getValue()
            if "/hardware/" in val or "/name/" in val:
                candidate = val.rstrip("/").split("/")[-1]
                if candidate:
                    manufacturer = candidate
                    break
        if not manufacturer:
            manufacturer = _guess_manufacturer(ip, port, service_url)

        results.append({
            "ip": ip,
            "port": port,
            "service_url": service_url,
            "manufacturer": manufacturer,
        })
        logger.info("ONVIF discovered: ip=%s port=%d manufacturer=%s", ip, port, manufacturer)

    return results


# ---------------------------------------------------------------------------
# Etapa 2: Port-scan fallback via tabela ARP
# ---------------------------------------------------------------------------

def _service_url(ip: str, port: int) -> str:
    if port == 554:
        return f"rtsp://{ip}:{port}/"
    scheme = "https" if port == 443 else "http"
    return f"{scheme}://{ip}:{port}/"


def discover_port_scan(timeout_per_host: float = 0.5) -> list[dict]:
    """
    Scan ARP-known hosts on typical camera ports using parallel threads.
    Returns [{ip, port, service_url, manufacturer}].
    """
    hosts = _arp_hosts()
    if not hosts:
        logger.debug("ARP table empty — port scan skipped")
        return []

    logger.info("port scan: %d hosts × %s", len(hosts), _CAMERA_PORTS)
    results: list[dict] = []
    lock = threading.Lock()

    def _scan(ip: str) -> None:
        for p in _CAMERA_PORTS:
            if _tcp_open(ip, p, timeout=timeout_per_host):
                url = _service_url(ip, p)
                mfr = _guess_manufacturer(ip, p, url)
                with lock:
                    results.append({
                        "ip": ip,
                        "port": p,
                        "service_url": url,
                        "manufacturer": mfr,
                    })
                logger.info("port-scan found: ip=%s port=%d manufacturer=%s", ip, p, mfr)
                return  # one entry per host

    threads = [threading.Thread(target=_scan, args=(h,), daemon=True) for h in hosts]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=timeout_per_host + 1.0)

    return results


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

def discover_cameras(timeout: float = 5.0) -> list[dict]:
    """
    ONVIF first; port scan as fallback when ONVIF returns nothing.
    Returns deduplicated [{ip, port, service_url, manufacturer}].
    """
    found = discover_onvif(timeout=timeout)
    if not found:
        logger.info("ONVIF returned nothing — falling back to port scan")
        found = discover_port_scan()

    seen: set[tuple[str, int]] = set()
    unique: list[dict] = []
    for r in found:
        key = (r["ip"], r["port"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    logger.info("camera discovery done: %d unique device(s) found", len(unique))
    return unique


# ---------------------------------------------------------------------------
# Etapa 3: Integração com Supabase (tabela agent_cameras_found)
# ---------------------------------------------------------------------------

def report_discovered(
    candidates: list[dict],
    token: str,
    supabase_url: str,
    anon_key: str = "",
) -> None:
    """POST discovered cameras to the agent-cameras-found Edge Function."""
    if not candidates:
        return
    payload = [
        {
            "ip": c["ip"],
            "port": c["port"],
            "service_url": c.get("service_url"),
            "manufacturer": c.get("manufacturer"),
        }
        for c in candidates
    ]
    try:
        resp = httpx.post(
            f"{supabase_url.rstrip('/')}/functions/v1/agent-cameras-found",
            json={"cameras": payload, "establishment_token": token},
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        logger.info(
            "reported %d camera candidate(s) to agent_cameras_found (inserted=%s)",
            len(payload),
            data.get("inserted"),
        )
    except Exception as exc:
        logger.warning("failed to report camera candidates: %s", exc)
