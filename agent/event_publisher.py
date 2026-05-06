# agent/event_publisher.py
import json
import logging
import sqlite3
import datetime
import httpx
from agent.models import CountEvent

logger = logging.getLogger(__name__)

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS pending_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    payload   TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""

class EventPublisher:
    def __init__(self, webhook_url: str, webhook_token: str, db_path: str = "queue.db"):
        self._url = webhook_url
        self._headers = {
            "Authorization": f"Bearer {webhook_token}",
            "Content-Type": "application/json",
        }
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute(CREATE_TABLE)
        self._db.commit()

    def publish(self, event: CountEvent) -> None:
        payload = json.dumps(event.to_dict())
        try:
            resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
            resp.raise_for_status()
            logger.info("event sent: camera=%s in=%d out=%d inside=%d",
                        event.camera_id, event.count_in, event.count_out, event.people_inside)
        except Exception as exc:
            logger.warning("event queued (send failed: %s)", exc)
            self._db.execute(
                "INSERT INTO pending_events (payload, created_at) VALUES (?, ?)",
                (payload, datetime.datetime.utcnow().isoformat()),
            )
            self._db.commit()

    def flush_queue(self) -> None:
        rows = self._db.execute(
            "SELECT id, payload FROM pending_events ORDER BY id LIMIT 50"
        ).fetchall()
        for row_id, payload in rows:
            try:
                resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
                resp.raise_for_status()
                self._db.execute("DELETE FROM pending_events WHERE id = ?", (row_id,))
                self._db.commit()
                logger.info("queued event %d flushed", row_id)
            except Exception as exc:
                logger.warning("flush failed for event %d: %s", row_id, exc)
                break

    def queue_size(self) -> int:
        return self._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0]
