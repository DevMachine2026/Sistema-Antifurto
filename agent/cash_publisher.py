# agent/cash_publisher.py
import json
import logging
import sqlite3
import datetime
import threading
import queue
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
        self._send_q: queue.Queue[str | None] = queue.Queue(maxsize=1000)
        self._worker = threading.Thread(target=self._send_worker, daemon=True, name="cash-publisher")
        self._worker.start()

    def _persist_offline(self, payload: str) -> None:
        with self._lock:
            count = self._db.execute("SELECT COUNT(*) FROM pending_cash_events").fetchone()[0]
            if count >= self.MAX_QUEUE:
                self._db.execute(
                    "DELETE FROM pending_cash_events WHERE id IN "
                    "(SELECT id FROM pending_cash_events ORDER BY id LIMIT ?)",
                    (count - self.MAX_QUEUE + 1,),
                )
            self._db.execute(
                "INSERT INTO pending_cash_events (payload, created_at) VALUES (?, ?)",
                (payload, datetime.datetime.now(datetime.timezone.utc).isoformat()),
            )
            self._db.commit()

    def _post_payload(self, payload: str) -> None:
        resp = httpx.post(self._url, content=payload, headers=self._headers, timeout=15)
        resp.raise_for_status()
        data = json.loads(payload)
        logger.info(
            "cash event sent: camera=%s confidence=%s",
            data.get("camera_id"),
            data.get("confidence"),
        )

    def _send_worker(self) -> None:
        while True:
            payload = self._send_q.get()
            if payload is None:
                break
            try:
                self._post_payload(payload)
            except Exception as exc:
                logger.warning("cash event queued (send failed: %s)", exc)
                try:
                    self._persist_offline(payload)
                except Exception as db_exc:
                    logger.error("failed to queue cash event (lost): %s", db_exc)
            finally:
                self._send_q.task_done()

    def publish(self, event: CashEvent) -> None:
        payload = json.dumps(event.to_dict())
        try:
            self._send_q.put_nowait(payload)
        except queue.Full:
            logger.error("cash send queue full — persisting offline camera=%s", event.camera_id)
            self._persist_offline(payload)

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
                logger.info("queued cash event %d flushed", row_id)
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

    def queue_size(self) -> int:
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM pending_cash_events").fetchone()[0]

    def close(self) -> None:
        try:
            self._send_q.put_nowait(None)
        except queue.Full:
            pass
        if self._worker.is_alive():
            self._worker.join(timeout=5)
        self._db.close()
