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


_DEFAULT_CREDS = [
    ("admin", "admin"),
    ("admin", "12345"),
    ("admin", ""),
    ("admin", "123456"),
    ("admin", "password"),
]

def _rtsp_probe(ip: str, port: int, username: str, password: str, timeout: float = 2.0) -> bool:
    """Tenta RTSP DESCRIBE com credenciais. Retorna True se 200 OK."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, port))
            req = (
                f"DESCRIBE rtsp://{username}:{password}@{ip}:{port}/ RTSP/1.0\r\n"
                f"CSeq: 1\r\n"
                f"Accept: application/sdp\r\n\r\n"
            ).encode()
            s.sendall(req)
            resp = s.recv(512).decode(errors="ignore")
            return "RTSP/1.0 200" in resp
    except Exception:
        return False


def _try_default_creds(ip: str, port: int = 554) -> tuple[str, str] | None:
    """
    Tenta credenciais padrão via RTSP DESCRIBE.
    Retorna (username, password) se encontrar, None caso contrário.
    """
    for user, pwd in _DEFAULT_CREDS:
        if _rtsp_probe(ip, port, user, pwd):
            logger.info("default creds work on %s:%d user=%s", ip, port, user)
            return user, pwd
    return None


_DVR_SIGNATURES = {
    "intelbras": ["intelbras", "mhdx", "nvd", "vd"],
    "hikvision": ["hikvision", "ds-"],
    "dahua":     ["dahua", "dhi-"],
}

def _detect_dvr(ip: str, port: int, timeout: float = 2.0) -> tuple[str | None, int | None]:
    """
    Faz probe HTTP no dispositivo. Retorna (manufacturer, channel_count_hint) ou (None, None).
    channel_count_hint é uma estimativa pelo modelo (ex: MHDX 3008 → 8).
    """
    import re as _re
    for p in ([port] if port in (80, 8000) else []) + [80, 8000]:
        try:
            url = f"http://{ip}:{p}/"
            resp = httpx.get(url, timeout=timeout, follow_redirects=False)
            content = (resp.headers.get("server", "") + " " + resp.text[:2000]).lower()

            for mfr, keywords in _DVR_SIGNATURES.items():
                if any(kw in content for kw in keywords):
                    ch = None
                    m = _re.search(r"(?:mhdx|nvd|ds-7|dhi-)\s*\d*0(\d+)", content)
                    if m:
                        try:
                            ch = int(m.group(1))
                        except ValueError:
                            ch = None
                    logger.info("DVR detected: ip=%s manufacturer=%s channels=%s", ip, mfr, ch)
                    return mfr, ch
        except Exception:
            continue
    return None, None


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

                # Detecta se é DVR
                device_type = "camera"
                channel_count: int | None = None
                if p in (80, 8000, 37777) or (mfr or "").lower() in ("dahua", "hikvision", "intelbras"):
                    dvr_mfr, ch = _detect_dvr(ip, p)
                    if dvr_mfr:
                        device_type = "dvr"
                        mfr = dvr_mfr.capitalize() if dvr_mfr else mfr
                        channel_count = ch

                # Tenta credenciais padrão via RTSP
                rtsp_port = 554 if _tcp_open(ip, 554, timeout=timeout_per_host) else p
                creds = _try_default_creds(ip, rtsp_port)

                with lock:
                    results.append({
                        "ip":              ip,
                        "port":            p,
                        "service_url":     url,
                        "manufacturer":    mfr,
                        "device_type":     device_type,
                        "channel_count":   channel_count,
                        "username":        creds[0] if creds else None,
                        "password":        creds[1] if creds else None,
                        "credentials_ok":  creds is not None,
                    })
                logger.info(
                    "port-scan found: ip=%s port=%d device=%s manufacturer=%s creds_ok=%s",
                    ip, p, device_type, mfr, creds is not None,
                )
                return

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
            "ip":             c["ip"],
            "port":           c.get("port"),
            "service_url":    c.get("service_url"),
            "manufacturer":   c.get("manufacturer"),
            "device_type":    c.get("device_type", "camera"),
            "channel_count":  c.get("channel_count"),
            "username":       c.get("username"),
            "password":       c.get("password"),
            "credentials_ok": c.get("credentials_ok"),
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
