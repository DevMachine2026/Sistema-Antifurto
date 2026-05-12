# agent/tests/test_scanner.py
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# _arp_hosts
# ---------------------------------------------------------------------------

def test_arp_hosts_parses_valid_ips(monkeypatch):
    sample = (
        "? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0\n"
        "? (192.168.1.50) at 11:22:33:44:55:66 [ether] on eth0\n"
        "? (255.255.255.255) at <incomplete> on eth0\n"
        "? (192.168.1.0) at <incomplete> on eth0\n"
    )
    import subprocess
    monkeypatch.setattr(subprocess, "check_output", lambda *a, **kw: sample)
    from agent.scanner import _arp_hosts
    hosts = _arp_hosts()
    assert "192.168.1.1" in hosts
    assert "192.168.1.50" in hosts
    assert "255.255.255.255" not in hosts  # broadcast filtered
    assert "192.168.1.0" not in hosts     # network address filtered


def test_arp_hosts_returns_empty_on_error(monkeypatch):
    import subprocess
    monkeypatch.setattr(subprocess, "check_output", MagicMock(side_effect=OSError("no arp")))
    from agent.scanner import _arp_hosts
    assert _arp_hosts() == []


# ---------------------------------------------------------------------------
# _tcp_open
# ---------------------------------------------------------------------------

def test_tcp_open_returns_true_on_success(monkeypatch):
    mock_sock = MagicMock()
    mock_sock.__enter__ = lambda s: s
    mock_sock.__exit__ = MagicMock(return_value=False)
    mock_sock.connect_ex.return_value = 0

    import socket
    monkeypatch.setattr(socket, "socket", lambda *a, **kw: mock_sock)
    from agent.scanner import _tcp_open
    assert _tcp_open("192.168.1.10", 554) is True


def test_tcp_open_returns_false_on_refused(monkeypatch):
    mock_sock = MagicMock()
    mock_sock.__enter__ = lambda s: s
    mock_sock.__exit__ = MagicMock(return_value=False)
    mock_sock.connect_ex.return_value = 111  # ECONNREFUSED

    import socket
    monkeypatch.setattr(socket, "socket", lambda *a, **kw: mock_sock)
    from agent.scanner import _tcp_open
    assert _tcp_open("192.168.1.10", 554) is False


# ---------------------------------------------------------------------------
# discover_onvif
# ---------------------------------------------------------------------------

def test_discover_onvif_skips_when_no_library(monkeypatch):
    monkeypatch.setitem(__import__("sys").modules, "wsdiscovery", None)
    from agent import scanner
    with patch.dict("sys.modules", {"wsdiscovery": None}):
        result = scanner.discover_onvif(timeout=1.0)
    assert result == []


def test_discover_onvif_parses_service(monkeypatch):
    mock_scope = MagicMock()
    mock_scope.getValue.return_value = "onvif://www.onvif.org/hardware/Hikvision"

    mock_svc = MagicMock()
    mock_svc.getXAddrs.return_value = ["http://192.168.1.20:80/onvif/device_service"]
    mock_svc.getScopes.return_value = [mock_scope]

    mock_wsd = MagicMock()
    mock_wsd.searchServices.return_value = [mock_svc]

    mock_module = MagicMock()
    mock_module.WSDiscovery.return_value = mock_wsd
    mock_module.QName = MagicMock(return_value="qname")

    with patch.dict("sys.modules", {"wsdiscovery": mock_module}):
        from importlib import reload
        import agent.scanner as scanner_mod
        reload(scanner_mod)
        result = scanner_mod.discover_onvif(timeout=1.0)

    assert len(result) == 1
    assert result[0]["ip"] == "192.168.1.20"
    assert result[0]["port"] == 80
    assert result[0]["service_url"] == "http://192.168.1.20:80/onvif/device_service"
    assert result[0]["manufacturer"] == "Hikvision"


# ---------------------------------------------------------------------------
# discover_port_scan
# ---------------------------------------------------------------------------

def test_discover_port_scan_returns_empty_with_empty_arp(monkeypatch):
    with patch("agent.scanner._arp_hosts", return_value=[]):
        from agent.scanner import discover_port_scan
        assert discover_port_scan() == []


def test_discover_port_scan_detects_open_port(monkeypatch):
    with (
        patch("agent.scanner._arp_hosts", return_value=["10.0.0.5"]),
        patch("agent.scanner._tcp_open", side_effect=lambda ip, p, **kw: p == 554),
        patch("agent.scanner._guess_manufacturer", return_value=None),
    ):
        from agent.scanner import discover_port_scan
        results = discover_port_scan(timeout_per_host=0.1)

    assert len(results) == 1
    assert results[0]["ip"] == "10.0.0.5"
    assert results[0]["port"] == 554
    assert results[0]["service_url"] == "rtsp://10.0.0.5:554/"


# ---------------------------------------------------------------------------
# discover_cameras (unified)
# ---------------------------------------------------------------------------

def test_discover_cameras_uses_onvif_result(monkeypatch):
    onvif_result = [{"ip": "10.0.0.1", "port": 80, "service_url": "http://10.0.0.1/onvif", "manufacturer": "Axis"}]
    with (
        patch("agent.scanner.discover_onvif", return_value=onvif_result),
        patch("agent.scanner.discover_port_scan") as mock_scan,
    ):
        from agent.scanner import discover_cameras
        result = discover_cameras()

    mock_scan.assert_not_called()
    assert result == onvif_result


def test_discover_cameras_falls_back_to_port_scan(monkeypatch):
    port_result = [{"ip": "10.0.0.2", "port": 37777, "service_url": "http://10.0.0.2:37777/", "manufacturer": "Dahua"}]
    with (
        patch("agent.scanner.discover_onvif", return_value=[]),
        patch("agent.scanner.discover_port_scan", return_value=port_result),
    ):
        from agent.scanner import discover_cameras
        result = discover_cameras()

    assert result == port_result


def test_discover_cameras_deduplicates():
    dup = [
        {"ip": "10.0.0.1", "port": 80, "service_url": "http://10.0.0.1/", "manufacturer": None},
        {"ip": "10.0.0.1", "port": 80, "service_url": "http://10.0.0.1/", "manufacturer": None},
    ]
    with (
        patch("agent.scanner.discover_onvif", return_value=dup),
        patch("agent.scanner.discover_port_scan", return_value=[]),
    ):
        from agent.scanner import discover_cameras
        result = discover_cameras()

    assert len(result) == 1


# ---------------------------------------------------------------------------
# report_discovered
# ---------------------------------------------------------------------------

def test_report_discovered_posts_correct_payload(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"inserted": 1}

    with patch("agent.scanner.httpx.post", return_value=mock_resp) as mock_post:
        from agent.scanner import report_discovered
        report_discovered(
            [{"ip": "10.0.0.1", "port": 554, "service_url": "rtsp://10.0.0.1:554/", "manufacturer": "Dahua"}],
            token="tok",
            supabase_url="https://example.supabase.co",
        )

    mock_post.assert_called_once()
    _, kwargs = mock_post.call_args
    cameras = kwargs["json"]["cameras"]
    assert cameras[0]["ip"] == "10.0.0.1"
    assert cameras[0]["port"] == 554
    assert cameras[0]["service_url"] == "rtsp://10.0.0.1:554/"
    assert cameras[0]["manufacturer"] == "Dahua"


def test_report_discovered_sends_apikey_and_establishment_token(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"inserted": 1}

    with patch("agent.scanner.httpx.post", return_value=mock_resp) as mock_post:
        from agent.scanner import report_discovered
        report_discovered(
            [{"ip": "10.0.0.1", "port": 554, "service_url": "rtsp://10.0.0.1:554/", "manufacturer": None}],
            token="est-tok-uuid",
            supabase_url="https://example.supabase.co",
            anon_key="anon-key-abc",
        )

    _, kwargs = mock_post.call_args
    assert kwargs["headers"]["apikey"] == "anon-key-abc"
    assert kwargs["headers"]["Authorization"] == "Bearer est-tok-uuid"
    assert kwargs["json"]["establishment_token"] == "est-tok-uuid"

def test_report_discovered_noop_on_empty():
    with patch("agent.scanner.httpx.post") as mock_post:
        from agent.scanner import report_discovered
        report_discovered([], token="tok", supabase_url="https://example.supabase.co")
    mock_post.assert_not_called()


def test_report_discovered_logs_warning_on_error(monkeypatch, caplog):
    import logging
    with (
        patch("agent.scanner.httpx.post", side_effect=Exception("timeout")),
        caplog.at_level(logging.WARNING, logger="agent.scanner"),
    ):
        from agent.scanner import report_discovered
        report_discovered(
            [{"ip": "10.0.0.1", "port": 80, "service_url": "http://10.0.0.1/", "manufacturer": None}],
            token="tok",
            supabase_url="https://example.supabase.co",
        )
    assert "failed to report" in caplog.text
