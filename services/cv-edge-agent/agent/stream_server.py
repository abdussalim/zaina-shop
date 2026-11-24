"""Lightweight stdlib ThreadingHTTPServer serving zero-latency MJPEG streams with CORS."""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FrameStore:
    """Thread-safe latest-frame buffer with Condition wakeups per camera."""

    def __init__(self, camera_names: tuple[str, ...] = ("cam1", "cam2")) -> None:
        self._cameras = set(camera_names)
        self._locks: dict[str, threading.Condition] = {name: threading.Condition() for name in self._cameras}
        self._frames: dict[str, bytes] = {}
        self._seqs: dict[str, int] = {name: 0 for name in self._cameras}
        self._timestamps: dict[str, float] = {}

    def has_camera(self, cam: str) -> bool:
        return cam in self._cameras

    def update(self, cam: str, jpeg_bytes: bytes) -> None:
        if not jpeg_bytes:
            return
        cond = self._locks.get(cam)
        if cond is None:
            cond = threading.Condition()
            self._locks[cam] = cond
            self._cameras.add(cam)
            self._seqs[cam] = 0

        with cond:
            self._frames[cam] = jpeg_bytes
            self._seqs[cam] += 1
            self._timestamps[cam] = time.time()
            cond.notify_all()

    def wait_for_frame(self, cam: str, last_seq: int, timeout_sec: float = 2.0) -> tuple[bytes | None, int]:
        cond = self._locks.get(cam)
        if cond is None:
            return None, last_seq
        with cond:
            if self._seqs.get(cam, 0) == last_seq:
                cond.wait(timeout=timeout_sec)
            seq = self._seqs.get(cam, 0)
            frame = self._frames.get(cam)
            return frame, seq

    def get_latest(self, cam: str) -> tuple[bytes | None, float | None]:
        cond = self._locks.get(cam)
        if cond is None:
            return None, None
        with cond:
            return self._frames.get(cam), self._timestamps.get(cam)

    def health_snapshot(self) -> dict[str, dict[str, object]]:
        now = time.time()
        snapshot: dict[str, dict[str, object]] = {}
        for cam in sorted(self._cameras):
            frame, ts = self.get_latest(cam)
            snapshot[cam] = {
                "hasFrame": frame is not None,
                "ageSec": round(now - ts, 2) if ts is not None else None,
                "seq": self._seqs.get(cam, 0),
            }
        return snapshot


class _MjpegThreadingServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        handler_cls: type[BaseHTTPRequestHandler],
        frame_store: FrameStore,
        stop_event: threading.Event,
    ) -> None:
        self.frame_store = frame_store
        self.stop_event = stop_event
        super().__init__(server_address, handler_cls)


class _MjpegRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        server: _MjpegThreadingServer = self.server  # type: ignore[assignment]

        if path == "/health":
            payload = json.dumps({
                "ok": True,
                "cameras": server.frame_store.health_snapshot(),
            }).encode("utf-8")
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if path in ("/stream/cam1", "/stream/cam2"):
            cam = path.rsplit("/", 1)[-1]
            self._handle_mjpeg_stream(cam, server)
            return

        if path in ("/snapshot/cam1", "/snapshot/cam2"):
            cam = path.rsplit("/", 1)[-1]
            frame, _ = server.frame_store.get_latest(cam)
            if frame is None:
                self._send_json_error(404, f"No frame available yet for {cam}")
                return
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(frame)))
            self.end_headers()
            self.wfile.write(frame)
            return

        self._send_json_error(404, "Not found")

    def _send_json_error(self, status: int, message: str) -> None:
        payload = json.dumps({"ok": False, "error": message}).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle_mjpeg_stream(self, cam: str, server: _MjpegThreadingServer) -> None:
        boundary = "frame"
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={boundary}")
        self.send_header("Connection", "close")
        self.end_headers()

        last_seq = 0
        try:
            while not server.stop_event.is_set():
                frame, seq = server.frame_store.wait_for_frame(cam, last_seq, timeout_sec=1.5)
                if frame is None:
                    continue
                if seq == last_seq:
                    # Re-send latest frame periodically on idle timeouts so connection stays alive
                    pass
                last_seq = seq
                part_header = (
                    f"--{boundary}\r\n"
                    f"Content-Type: image/jpeg\r\n"
                    f"Content-Length: {len(frame)}\r\n\r\n"
                ).encode("ascii")
                self.wfile.write(part_header)
                self.wfile.write(frame)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            # Browser closed the MJPEG stream cleanly
            return

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        # Keep stdout focused on CV/heartbeat logs rather than per-request noise
        return


class StreamServer:
    """Manages the lifecycle of the MJPEG ThreadingHTTPServer."""

    def __init__(
        self,
        host: str,
        port: int,
        frame_store: FrameStore,
        stop_event: threading.Event,
    ) -> None:
        self.host = host
        self.port = port
        self.frame_store = frame_store
        self.stop_event = stop_event
        self._httpd: _MjpegThreadingServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._httpd = _MjpegThreadingServer(
            (self.host, self.port),
            _MjpegRequestHandler,
            self.frame_store,
            self.stop_event,
        )
        self._thread = threading.Thread(
            target=self._httpd.serve_forever,
            name="mjpeg-stream-server",
            daemon=True,
        )
        self._thread.start()
        actual_port = self._httpd.server_address[1]
        print(f"[STREAM_SERVER] MJPEG listening on http://{self.host}:{actual_port} (/stream/cam1, /stream/cam2, /health)")

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=2.0)
