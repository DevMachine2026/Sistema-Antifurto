# agent/event_publisher.py
import json
import logging
import sqlite3
import datetime
import threading
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
    MAX_QUEUE = 10_000

    def __init__(self, webhook_url: str, webhook_token: str, db_path: str = "queue.db"):
        self._url = webhook_url
        self._headers = {
            "Authorization": f"Bearer {webhook_token}",
            "Content-Type": "application/json",
        }
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(CREATE_TABLE)
        self._db.commit()
        self._lock = threading.Lock()

    def publish(self, event: CountEvent) -> None:
        payload = json.dumps(event.to_dict())
        try:
            resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
            resp.raise_for_status()
            logger.info("event sent: camera=%s in=%d out=%d inside=%d",
                        event.camera_id, event.count_in, event.count_out, event.people_inside)
        except Exception as exc:
            logger.warning("event queued (send failed: %s)", exc)
            with self._lock:
                count = self._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0]
                if count >= self.MAX_QUEUE:
                    self._db.execute(
                        "DELETE FROM pending_events WHERE id IN "
                        "(SELECT id FROM pending_events ORDER BY id LIMIT ?)",
                        (count - self.MAX_QUEUE + 1,),
                    )
                    logger.error("event queue at cap (%d), dropped oldest", self.MAX_QUEUE)
                try:
                    self._db.execute(
                        "INSERT INTO pending_events (payload, created_at) VALUES (?, ?)",
                        (payload, datetime.datetime.now(datetime.timezone.utc).isoformat()),
                    )
                    self._db.commit()
                except Exception as db_exc:
                    logger.error("failed to queue event (lost): %s", db_exc)

    def flush_queue(self) -> None:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, payload FROM pending_events ORDER BY id LIMIT 50"
            ).fetchall()
        for row_id, payload in rows:
            try:
                resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
                resp.raise_for_status()
                with self._lock:
                    self._db.execute("DELETE FROM pending_events WHERE id = ?", (row_id,))
                    self._db.commit()
                logger.info("queued event %d flushed", row_id)
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                # 4xx errors (except 408 Request Timeout and 429 Too Many Requests) mean
                # bad payload that will never succeed — drop and continue
                if 400 <= status < 500 and status not in (408, 429):
                    logger.error("dropping undeliverable event %d (HTTP %d): %s", row_id, status, exc)
                    with self._lock:
                        self._db.execute("DELETE FROM pending_events WHERE id = ?", (row_id,))
                        self._db.commit()
                    continue
                # 5xx or retriable 4xx — stop and retry later
                logger.warning("flush failed for event %d: %s", row_id, exc)
                break
            except Exception as exc:
                logger.warning("flush failed for event %d: %s", row_id, exc)
                break

    def queue_size(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0]

    def close(self) -> None:
        self._db.close()
