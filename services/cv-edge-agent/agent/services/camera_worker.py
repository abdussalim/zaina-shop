"""Per-camera worker: RTSP lifecycle, ROI cropping, OpenVINO inference, tracking, MJPEG & cloud sync."""

from __future__ import annotations

import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from agent.cloud_client import CloudClient
from agent.config import AgentConfig, CameraConfig
from agent.services.ffmpeg_stream import FFmpegStream
from agent.stream_server import FrameStore
from agent.vision.detector import PersonDetector
from agent.vision.tracker import CentroidTracker

_PACKAGE_ROOT = Path(__file__).resolve().parents[2]


class DesiredStateStore:
    """Thread-safe synchronized control state polled from Cloudflare."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, Any] = {
            "door_closed": False,
            "op_mode": "watch",
            "cam1_active": True,
            "cam2_active": True,
        }

    def update_from_cloud(self, desired_state: dict[str, Any]) -> bool:
        """Apply `desiredState` payload from heartbeat; returns True if anything changed."""
        new_state = {
            "door_closed": bool(desired_state.get("doorClosed", False)),
            "op_mode": "serving" if desired_state.get("opMode") == "serving" else "watch",
            "cam1_active": bool(desired_state.get("cam1Active", True)),
            "cam2_active": bool(desired_state.get("cam2Active", True)),
        }
        with self._lock:
            changed = new_state != self._state
            self._state = new_state
            return changed

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._state)


def resolve_model_path(explicit_path: str | None = None) -> str:
    """Resolve OpenVINO model XML path: explicit override -> INT8 -> FP16 -> FP32."""
    if explicit_path:
        candidate = Path(explicit_path)
        if not candidate.is_absolute() and not candidate.is_file():
            candidate = _PACKAGE_ROOT / explicit_path
        if candidate.is_file():
            print(f"[INFO] OpenVINO model selected (custom): {candidate}")
            return str(candidate)
        raise FileNotFoundError(f"Configured OPENVINO_MODEL_PATH not found: {explicit_path}")

    rel_candidates = [
        "models/intel/person-detection-0200/INT8/person-detection-0200.xml",
        "models/intel/person-detection-0200/FP16/person-detection-0200.xml",
        "models/person-detection-0200/person-detection-0200.xml",
    ]
    for base in (Path.cwd(), _PACKAGE_ROOT):
        for rel in rel_candidates:
            candidate = base / rel
            if candidate.is_file():
                precision = "INT8" if "INT8" in rel else "FP16" if "FP16" in rel else "FP32"
                print(f"[INFO] OpenVINO model selected: {precision} -> {candidate}")
                return str(candidate)

    raise FileNotFoundError(
        "No OpenVINO model found. Place person-detection-0200.{xml,bin} under "
        "services/cv-edge-agent/models/intel/person-detection-0200/FP16/."
    )


def _now_str() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def _encode_jpeg(frame: np.ndarray, quality: int) -> bytes | None:
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return None
    return buffer.tobytes()


def _make_closed_placeholder(label: str) -> np.ndarray:
    """Build the 640x360 black frame with bold red 'X' when camera/store is OFF."""
    display_frame = np.zeros((360, 640, 3), dtype=np.uint8)
    cv2.line(display_frame, (20, 20), (620, 340), (0, 0, 255), 15)
    cv2.line(display_frame, (20, 340), (620, 20), (0, 0, 255), 15)
    cv2.putText(display_frame, label, (24, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (200, 200, 200), 2)
    return display_frame


def run_camera_worker(
    cam_cfg: CameraConfig,
    agent_cfg: AgentConfig,
    state_store: DesiredStateStore,
    frame_store: FrameStore,
    cloud_client: CloudClient,
    stop_event: threading.Event,
) -> None:
    """Run RTSP capture, detection/tracking, local MJPEG buffer update, and cloud sync."""
    name = cam_cfg.name
    print(f"[{_now_str()}] [INFO] Starting camera worker for {name}")

    stream = FFmpegStream(cam_cfg.rtsp_url)
    detector: PersonDetector | None = None
    try:
        model_path = resolve_model_path(agent_cfg.openvino_model_path)
        detector = PersonDetector(model_path=model_path, device=agent_cfg.openvino_device)
    except Exception as exc:
        print(f"[{_now_str()}] [WARN] {name} running without OpenVINO detector ({exc})")

    tracker = CentroidTracker(max_disappeared=10, max_distance=100)
    previous_ids: set[int] = set()

    last_display_time = 0.0
    last_cloud_upload_time = 0.0
    skip_counter = 0

    def publish_frame(frame: np.ndarray) -> None:
        nonlocal last_cloud_upload_time
        mjpeg_bytes = _encode_jpeg(frame, agent_cfg.jpeg_quality)
        if mjpeg_bytes:
            frame_store.update(name, mjpeg_bytes)

        now_mono = time.monotonic()
        if (
            agent_cfg.upload_frames_to_cloud
            and cloud_client.enabled
            and (now_mono - last_cloud_upload_time) >= agent_cfg.frame_upload_interval_sec
        ):
            last_cloud_upload_time = now_mono
            cloud_bytes = (
                mjpeg_bytes
                if agent_cfg.cloud_jpeg_quality == agent_cfg.jpeg_quality and mjpeg_bytes
                else _encode_jpeg(frame, agent_cfg.cloud_jpeg_quality)
            )
            if cloud_bytes:
                cloud_client.enqueue_frame(name, cloud_bytes)

    try:
        while not stop_event.is_set():
            state = state_store.snapshot()
            is_closed = state["door_closed"]
            mode = state["op_mode"]
            is_active = state.get(f"{name}_active", True)

            # 1. Per-camera power OFF or store CLOSED -> stop RTSP & emit red X
            if is_closed or not is_active:
                if stream.is_running():
                    print(f"[{_now_str()}] [INFO] {name} SHUTDOWN (Closed:{is_closed}/Active:{is_active}).")
                    stream.stop()

                if previous_ids:
                    previous_ids.clear()
                    tracker.reset()

                now_mono = time.monotonic()
                if (now_mono - last_display_time) >= 0.5:
                    last_display_time = now_mono
                    reason = "TOKO TUTUP" if is_closed else f"{name.upper()} OFF"
                    publish_frame(_make_closed_placeholder(reason))

                stop_event.wait(0.1)
                continue

            # Ensure RTSP stream is running when camera is active and store is open
            if not stream.is_running():
                print(f"[{_now_str()}] [INFO] {name} WAKING UP...")
                stream.start()
                stop_event.wait(0.3)

            frame = stream.read()
            if frame is None:
                stop_event.wait(0.05)
                continue

            h, w, _ = frame.shape
            x1, y1, x2, y2 = cam_cfg.roi.crop_bounds(w, h)
            roi_person = frame[y1:y2, x1:x2]

            # 2. Serving mode (or missing model fallback) -> raw ROI stream, no inference
            if mode == "serving" or detector is None:
                now_mono = time.monotonic()
                if (now_mono - last_display_time) >= agent_cfg.inference_budget_sec:
                    last_display_time = now_mono
                    publish_frame(roi_person)
                else:
                    stop_event.wait(0.02)
                continue

            # Adaptive frame skip proportional to over-budget inference latency
            if skip_counter > 0:
                skip_counter -= 1
                stop_event.wait(0.01)
                continue

            # 3. Watch mode -> OpenVINO inference + CentroidTracker
            t0 = time.monotonic()
            boxes = detector.detect(roi_person, conf_threshold=cam_cfg.threshold)
            inference_sec = time.monotonic() - t0

            if inference_sec > agent_cfg.inference_budget_sec:
                skip_counter = max(0, int(inference_sec / agent_cfg.inference_budget_sec) - 1)

            objects = tracker.update(boxes)
            current_ids = set(objects.keys())

            new_ids = current_ids - previous_ids
            lost_ids = previous_ids - current_ids

            for nid in new_ids:
                cloud_client.enqueue_event("person_enter", name, nid)
                print(f"[{_now_str()}] [EVENT] PERSON_ENTER {name} ID:{nid}")

            for lid in lost_ids:
                cloud_client.enqueue_event("person_exit", name, lid)
                print(f"[{_now_str()}] [EVENT] PERSON_EXIT {name} ID:{lid}")

            previous_ids = current_ids

            now_mono = time.monotonic()
            if (now_mono - last_display_time) >= agent_cfg.inference_budget_sec:
                last_display_time = now_mono
                display_frame = roi_person.copy()

                for xmin, ymin, xmax, ymax, _ in boxes:
                    cv2.rectangle(display_frame, (xmin, ymin), (xmax, ymax), (0, 255, 0), 2)

                for object_id, (cx, cy) in objects.items():
                    cv2.circle(display_frame, (cx, cy), 4, (0, 0, 255), -1)
                    cv2.putText(
                        display_frame,
                        f"ID: {object_id}",
                        (cx - 10, max(16, cy - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 255, 0),
                        2,
                    )

                publish_frame(display_frame)
    finally:
        stream.stop()
        print(f"[{_now_str()}] [INFO] Stopped camera worker for {name}")
