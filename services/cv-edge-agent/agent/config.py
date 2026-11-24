"""Environment-driven configuration for the Toko Zaina CV Edge Agent."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit
from dotenv import load_dotenv


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_float(value: str | None, default: float, min_val: float | None = None, max_val: float | None = None) -> float:
    try:
        parsed = float(value) if value is not None and value.strip() != "" else default
    except ValueError:
        parsed = default
    if min_val is not None:
        parsed = max(min_val, parsed)
    if max_val is not None:
        parsed = min(max_val, parsed)
    return parsed


def _parse_int(value: str | None, default: int, min_val: int | None = None, max_val: int | None = None) -> int:
    try:
        parsed = int(value) if value is not None and value.strip() != "" else default
    except ValueError:
        parsed = default
    if min_val is not None:
        parsed = max(min_val, parsed)
    if max_val is not None:
        parsed = min(max_val, parsed)
    return parsed


def redact_rtsp_url(url: str) -> str:
    """Mask username and password in an RTSP URL before logging."""
    try:
        parts = urlsplit(url)
        if "@" not in parts.netloc:
            return url
        _, host_part = parts.netloc.rsplit("@", 1)
        return urlunsplit((parts.scheme, f"***:***@{host_part}", parts.path, parts.query, parts.fragment))
    except Exception:
        return "rtsp://***"


@dataclass(frozen=True)
class RoiConfig:
    """Normalized [0..1] Region of Interest coordinates."""

    x1: float
    y1: float
    x2: float
    y2: float

    @classmethod
    def parse(cls, raw: str | None, default: tuple[float, float, float, float]) -> "RoiConfig":
        if not raw or not raw.strip():
            return cls(*default)
        parts = [p.strip() for p in raw.split(",")]
        if len(parts) != 4:
            return cls(*default)
        try:
            x1, y1, x2, y2 = (max(0.0, min(1.0, float(p))) for p in parts)
        except ValueError:
            return cls(*default)
        if x2 <= x1 or y2 <= y1:
            return cls(*default)
        return cls(x1=x1, y1=y1, x2=x2, y2=y2)

    def crop_bounds(self, width: int, height: int) -> tuple[int, int, int, int]:
        """Convert normalized ROI into valid pixel bounds (x1, y1, x2, y2)."""
        px1 = max(0, min(width - 1, int(width * self.x1)))
        py1 = max(0, min(height - 1, int(height * self.y1)))
        px2 = max(px1 + 1, min(width, int(width * self.x2)))
        py2 = max(py1 + 1, min(height, int(height * self.y2)))
        return px1, py1, px2, py2


@dataclass(frozen=True)
class CameraConfig:
    """Per-camera RTSP source, threshold, and ROI settings."""

    name: str
    rtsp_url: str
    threshold: float
    roi: RoiConfig


@dataclass(frozen=True)
class AgentConfig:
    """Top-level configuration loaded from environment variables."""

    cloudflare_api_base: str
    monitor_agent_key: str
    openvino_device: str
    openvino_model_path: str | None
    mjpeg_port: int
    mjpeg_host: str
    upload_frames_to_cloud: bool
    frame_upload_interval_sec: float
    heartbeat_interval_sec: float
    inference_budget_sec: float
    jpeg_quality: int
    cloud_jpeg_quality: int
    cameras: tuple[CameraConfig, ...]

    @classmethod
    def from_env(cls, env_file: str | None = None) -> "AgentConfig":
        """Load configuration from `.env` (if present) and process environment."""
        load_dotenv(dotenv_path=env_file, override=False)

        api_base = os.getenv("CLOUDFLARE_API_BASE", "").strip().rstrip("/")
        agent_key = os.getenv("MONITOR_AGENT_KEY", "").strip()

        cameras: list[CameraConfig] = []
        cam1_url = os.getenv("CAM1_RTSP_URL", "").strip()
        if cam1_url:
            cameras.append(
                CameraConfig(
                    name="cam1",
                    rtsp_url=cam1_url,
                    threshold=_parse_float(os.getenv("CAM1_THRESHOLD"), 0.5, 0.1, 0.99),
                    roi=RoiConfig.parse(os.getenv("CAM1_ROI"), (0.0, 0.0, 0.8, 1.0)),
                )
            )

        cam2_url = os.getenv("CAM2_RTSP_URL", "").strip()
        if cam2_url:
            cameras.append(
                CameraConfig(
                    name="cam2",
                    rtsp_url=cam2_url,
                    threshold=_parse_float(os.getenv("CAM2_THRESHOLD"), 0.45, 0.1, 0.99),
                    roi=RoiConfig.parse(os.getenv("CAM2_ROI"), (0.3, 0.4, 1.0, 1.0)),
                )
            )

        model_override = os.getenv("OPENVINO_MODEL_PATH", "").strip() or None

        return cls(
            cloudflare_api_base=api_base,
            monitor_agent_key=agent_key,
            openvino_device=os.getenv("OPENVINO_DEVICE", "GPU").strip().upper() or "GPU",
            openvino_model_path=model_override,
            mjpeg_port=_parse_int(os.getenv("MJPEG_PORT"), 8090, 0, 65535),
            mjpeg_host=os.getenv("MJPEG_HOST", "0.0.0.0").strip() or "0.0.0.0",
            upload_frames_to_cloud=_parse_bool(os.getenv("UPLOAD_FRAMES_TO_CLOUD"), True),
            frame_upload_interval_sec=_parse_float(os.getenv("FRAME_UPLOAD_INTERVAL_SEC"), 1.2, 0.2, 60.0),
            heartbeat_interval_sec=_parse_float(os.getenv("HEARTBEAT_INTERVAL_SEC"), 5.0, 1.0, 60.0),
            inference_budget_sec=_parse_float(os.getenv("INFERENCE_BUDGET_SEC"), 0.1, 0.02, 2.0),
            jpeg_quality=_parse_int(os.getenv("JPEG_QUALITY"), 60, 15, 95),
            cloud_jpeg_quality=_parse_int(os.getenv("CLOUD_JPEG_QUALITY"), 45, 15, 90),
            cameras=tuple(cameras),
        )
