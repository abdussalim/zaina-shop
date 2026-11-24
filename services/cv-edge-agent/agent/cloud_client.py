"""Resilient HTTP client for communicating with the Cloudflare Workers Monitor API."""

from __future__ import annotations

import queue
import threading
import time
from typing import Any

import requests


class CloudClient:
    """Calls Cloudflare `/api/v1/monitor/agent/*` endpoints with graceful retry."""

    def __init__(self, api_base: str, agent_key: str, timeout_sec: float = 8.0) -> None:
        self.api_base = api_base.rstrip("/")
        self.agent_key = agent_key
        self.timeout_sec = timeout_sec
        self.enabled = bool(self.api_base and self.agent_key)

        self._session = requests.Session()
        self._session.headers.update({"X-Monitor-Agent-Key": self.agent_key})

        self._last_warn_by_tag: dict[str, float] = {}
        self._warn_lock = threading.Lock()

        # Non-blocking background queue for events & cloud frame snapshots so CV loop never stalls
        self._dispatch_queue: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue(maxsize=64)
        self._stop_event = threading.Event()
        self._dispatcher_thread = threading.Thread(
            target=self._dispatch_loop,
            name="cloud-dispatcher",
            daemon=True,
        )
        self._dispatcher_thread.start()

    def _warn_throttled(self, tag: str, message: str, cooldown_sec: float = 15.0) -> None:
        now = time.monotonic()
        with self._warn_lock:
            last = self._last_warn_by_tag.get(tag, 0.0)
            if now - last < cooldown_sec:
                return
            self._last_warn_by_tag[tag] = now
        print(f"[CLOUD][WARN] {message}")

    def _post_with_retry(
        self,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        raw_body: bytes | None = None,
        content_type: str = "application/json",
        max_attempts: int = 3,
    ) -> requests.Response | None:
        if not self.enabled:
            return None

        url = f"{self.api_base}{path}"
        headers = {"Content-Type": content_type}

        for attempt in range(1, max_attempts + 1):
            try:
                resp = self._session.post(
                    url,
                    json=json_body,
                    data=raw_body,
                    headers=headers,
                    timeout=self.timeout_sec,
                )
                if resp.status_code < 400:
                    return resp

                # Never retry 4xx client/auth errors
                if 400 <= resp.status_code < 500:
                    self._warn_throttled(
                        f"http-{resp.status_code}-{path}",
                        f"POST {path} rejected with HTTP {resp.status_code}: {resp.text[:160]}",
                    )
                    return None

                if attempt < max_attempts:
                    time.sleep(0.35 * attempt)
                else:
                    self._warn_throttled(
                        f"http-5xx-{path}",
                        f"POST {path} failed with HTTP {resp.status_code} after {max_attempts} attempts",
                    )
            except requests.RequestException as exc:
                if attempt < max_attempts:
                    time.sleep(0.35 * attempt)
                else:
                    self._warn_throttled(
                        f"net-{path}",
                        f"POST {path} network error after {max_attempts} attempts: {exc}",
                    )

        return None

    def send_heartbeat(
        self,
        cpu: float,
        mem: float,
        gpu: float,
        server_specs: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Send hardware telemetry and retrieve `desiredState` from Cloudflare."""
        payload: dict[str, Any] = {
            "cpu": round(float(cpu), 2),
            "mem": round(float(mem), 2),
            "gpu": round(float(gpu), 2),
        }
        if server_specs:
            payload["serverSpecs"] = server_specs

        resp = self._post_with_retry("/api/v1/monitor/agent/heartbeat", json_body=payload, max_attempts=2)
        if resp is None:
            return None

        try:
            body = resp.json()
        except ValueError:
            self._warn_throttled("heartbeat-json", "Heartbeat response was not valid JSON")
            return None

        if isinstance(body, dict):
            data = body.get("data")
            if isinstance(data, dict) and isinstance(data.get("desiredState"), dict):
                return data["desiredState"]
            if isinstance(body.get("desiredState"), dict):
                return body["desiredState"]
        return None

    def upload_frame(self, cam: str, jpeg_bytes: bytes) -> bool:
        """Synchronously upload a JPEG frame to `/api/v1/monitor/agent/frame/{cam}`."""
        if not jpeg_bytes:
            return False
        resp = self._post_with_retry(
            f"/api/v1/monitor/agent/frame/{cam}",
            raw_body=jpeg_bytes,
            content_type="image/jpeg",
            max_attempts=2,
        )
        return resp is not None

    def send_event(self, event_type: str, cam: str, track_id: int) -> bool:
        """Synchronously report a `person_enter` or `person_exit` event."""
        payload = {
            "eventType": event_type,
            "cam": cam,
            "trackId": int(track_id),
        }
        resp = self._post_with_retry(
            "/api/v1/monitor/agent/events",
            json_body=payload,
            max_attempts=3,
        )
        return resp is not None

    def enqueue_frame(self, cam: str, jpeg_bytes: bytes) -> None:
        """Queue a JPEG snapshot for async upload, dropping oldest frame work if congested."""
        if not self.enabled or not jpeg_bytes:
            return
        item = ("frame", {"cam": cam, "jpeg": jpeg_bytes})
        try:
            self._dispatch_queue.put_nowait(item)
        except queue.Full:
            # Drop one stale queued item to prioritize fresh frames/events
            try:
                self._dispatch_queue.get_nowait()
                self._dispatch_queue.task_done()
            except queue.Empty:
                pass
            try:
                self._dispatch_queue.put_nowait(item)
            except queue.Full:
                pass

    def enqueue_event(self, event_type: str, cam: str, track_id: int) -> None:
        """Queue a person detection event for async delivery."""
        if not self.enabled:
            return
        item = ("event", {"event_type": event_type, "cam": cam, "track_id": int(track_id)})
        try:
            self._dispatch_queue.put_nowait(item)
        except queue.Full:
            self._warn_throttled("queue-full", "Cloud dispatch queue full; dropping oldest item")
            try:
                self._dispatch_queue.get_nowait()
                self._dispatch_queue.task_done()
            except queue.Empty:
                pass
            try:
                self._dispatch_queue.put_nowait(item)
            except queue.Full:
                pass

    def _dispatch_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                kind, data = self._dispatch_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            try:
                if kind == "frame":
                    self.upload_frame(data["cam"], data["jpeg"])
                elif kind == "event":
                    self.send_event(data["event_type"], data["cam"], data["track_id"])
            finally:
                self._dispatch_queue.task_done()

    def close(self) -> None:
        """Stop background dispatcher and close HTTP session."""
        self._stop_event.set()
        if self._dispatcher_thread.is_alive():
            self._dispatcher_thread.join(timeout=2.0)
        self._session.close()
