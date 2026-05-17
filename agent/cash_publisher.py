# agent/cash_publisher.py
import json
import logging
import sqlite3
import datetime
import threading
import httpx
from agent.models import CashEvent

logger = logging.getLogger(__name__)

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS pending_cash_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""


class CashPublisher:
    MAX_QUEUE = 5_000

    def __init__(
        self,
        webhook_url: str,
        webhook_token: str,
        db_path: str = "queue.db",
        anon_key: str = "",
    ):
        self._url = webhook_url
        self._headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {webhook_token}",
            "Content-Type": "application/json",
        }
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(CREATE_TABLE)
        self._db.commit()
        self._lock = threading.Lock()

    def publish(self, event: CashEvent) -> None:
        payload = json.dumps(event.to_dict())
        try:
            resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=15)
            resp.raise_for_status()
            logger.info(
                "cash event sent: camera=%s confidence=%.2f",
                event.camera_id,
                event.confidence,
            )
        except Exception as exc:
            logger.warning("cash event queued (send failed: %s)", exc)
            self._enqueue(payload)

    def _enqueue(self, payload: str) -> None:
        with self._lock:
            count = self._db.execute("SELECT COUNT(*) FROM pending_cash_events").fetchone()[0]
            if count >= self.MAX_QUEUE:
                self._db.execute(
                    "DELETE FROM pending_cash_events WHERE id IN "
                    "(SELECT id FROM pending_cash_events ORDER BY id LIMIT ?)",
                    (count - self.MAX_QUEUE + 1,),
                )
            try:
                self._db.execute(
                    "INSERT INTO pending_cash_events (payload, created_at) VALUES (?, ?)",
                    (payload, datetime.datetime.now(datetime.timezone.utc).isoformat()),
                )
                self._db.commit()
            except Exception as db_exc:
                logger.error("failed to queue cash event (lost): %s", db_exc)

    def flush_queue(self) -> None:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, payload FROM pending_cash_events ORDER BY id LIMIT 50"
            ).fetchall()
        for row_id, payload in rows:
            try:
                resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=15)
                resp.raise_for_status()
                with self._lock:
                    self._db.execute("DELETE FROM pending_cash_events WHERE id = ?", (row_id,))
                    self._db.commit()
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if 400 <= status < 500 and status not in (408, 429):
                    with self._lock:
                        self._db.execute("DELETE FROM pending_cash_events WHERE id = ?", (row_id,))
                        self._db.commit()
                    continue
                break
            except Exception:
                break

    def close(self) -> None:
        self._db.close()
