# agent/camera_discovery.py
"""Backward-compatible shim — all logic lives in agent.scanner."""
from agent.scanner import discover_cameras, report_discovered

__all__ = ["discover_cameras", "report_discovered"]
