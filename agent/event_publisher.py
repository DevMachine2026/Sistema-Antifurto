# agent/event_publisher.py
import json
import logging
import sqlite3
import datetime
import threading
import queue
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

    def __init__(self, webhook_url: str, webhook_token: str, db_path: str = "queue.db", anon_key: str = ""):
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
        self._send_q: queue.Queue[str | None] = queue.Queue(maxsize=2000)
        self._worker = threading.Thread(target=self._send_worker, daemon=True, name="event-publisher")
        self._worker.start()

    def _persist_offline(self, payload: str) -> None:
        with self._lock:
            count = self._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0]
            if count >= self.MAX_QUEUE:
                self._db.execute(
                    "DELETE FROM pending_events WHERE id IN "
                    "(SELECT id FROM pending_events ORDER BY id LIMIT ?)",
                    (count - self.MAX_QUEUE + 1,),
                )
                logger.error("event queue at cap (%d), dropped oldest", self.MAX_QUEUE)
            self._db.execute(
                "INSERT INTO pending_events (payload, created_at) VALUES (?, ?)",
                (payload, datetime.datetime.now(datetime.timezone.utc).isoformat()),
            )
            self._db.commit()

    def _post_payload(self, payload: str) -> None:
        resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=10)
        resp.raise_for_status()
        data = json.loads(payload)
        logger.info(
            "event sent: camera=%s in=%d out=%d inside=%d",
            data.get("camera_id"),
            data.get("count_in"),
            data.get("count_out"),
            data.get("people_inside"),
        )

    def _send_worker(self) -> None:
        while True:
            payload = self._send_q.get()
            if payload is None:
                break
            try:
                self._post_payload(payload)
            except Exception as exc:
                logger.warning("event queued (send failed: %s)", exc)
                try:
                    self._persist_offline(payload)
                except Exception as db_exc:
                    logger.error("failed to queue event (lost): %s", db_exc)
            finally:
                self._send_q.task_done()

    def publish(self, event: CountEvent) -> None:
        payload = json.dumps(event.to_dict())
        try:
            self._send_q.put_nowait(payload)
        except queue.Full:
            logger.error("send queue full — persisting offline camera=%s", event.camera_id)
            self._persist_offline(payload)

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
        try:
            self._send_q.put_nowait(None)
        except queue.Full:
            pass
        if self._worker.is_alive():
            self._worker.join(timeout=5)
        self._db.close()
