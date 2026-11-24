"""Non-blocking RTSP capture thread using OpenCV VideoCapture."""

from __future__ import annotations

import threading
import time

import cv2
import numpy as np

from agent.config import redact_rtsp_url


class FFmpegStream:
    """Provides non-blocking access to the latest RTSP frame."""

    def __init__(self, url: str) -> None:
        self.url = url
        self.safe_url = redact_rtsp_url(url)
        self.cap: cv2.VideoCapture | None = None
        self.frame: np.ndarray | None = None
        self.running = False
        self.thread: threading.Thread | None = None
        self.lock = threading.Lock()

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(
            target=self._update,
            name=f"rtsp-{self.safe_url}",
            daemon=True,
        )
        self.thread.start()
        print(f"[STREAM] Thread started for {self.safe_url}")

    def _open_capture(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self.url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _update(self) -> None:
        self.cap = self._open_capture()

        while self.running:
            if not self.cap or not self.cap.isOpened():
                print(f"[STREAM] Reconnecting to {self.safe_url}...")
                if self.cap is not None:
                    self.cap.release()
                time.sleep(2.0)
                if not self.running:
                    break
                self.cap = self._open_capture()
                continue

            ret, frame = self.cap.read()
            if not ret or frame is None:
                print(f"[STREAM] Frame capture failed from {self.safe_url}. Retrying...")
                self.cap.release()
                self.cap = None
                time.sleep(1.0)
                continue

            with self.lock:
                self.frame = frame

        if self.cap is not None:
            self.cap.release()
            self.cap = None
            print(f"[STREAM] Released {self.safe_url}")

    def read(self) -> np.ndarray | None:
        with self.lock:
            return None if self.frame is None else self.frame.copy()

    def stop(self) -> None:
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        with self.lock:
            self.frame = None

    def is_running(self) -> bool:
        return self.running
