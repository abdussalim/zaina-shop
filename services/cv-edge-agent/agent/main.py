"""Entrypoint for the Toko Zaina CV Edge Agent."""

from __future__ import annotations

import os
import platform
import re
import shutil
import signal
import subprocess
import threading
from typing import Any

import psutil

from agent.cloud_client import CloudClient
from agent.config import AgentConfig, redact_rtsp_url
from agent.services.camera_worker import DesiredStateStore, run_camera_worker
from agent.stream_server import FrameStore, StreamServer


def _detect_cpu_model() -> str:
    cpu = platform.processor().strip()
    if cpu and cpu.lower() not in {"x86_64", "amd64", "arm64"}:
        return cpu[:160]
    try:
        with open("/proc/cpuinfo", "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    _, val = line.split(":", 1)
                    model = val.strip()
                    if model:
                        return model[:160]
    except OSError:
        pass
    return (cpu or platform.machine() or "Intel CPU")[:160]


def get_server_specs() -> dict[str, Any]:
    """Collect host hardware specifications for Cloudflare Monitor snapshot."""
    total_gb = psutil.virtual_memory().total / (1024 ** 3)
    return {
        "os": f"{platform.system()} {platform.release()}"[:120],
        "arch": (platform.machine() or "unknown")[:40],
        "cpu": _detect_cpu_model(),
        "cores": int(psutil.cpu_count(logical=True) or os.cpu_count() or 1),
        "ram": f"{total_gb:.1f} GB"[:40],
    }


def read_intel_gpu_busy() -> float:
    """Read Intel iGPU Render/3D busy percentage via `intel_gpu_top`, falling back to 0.0."""
    binary = shutil.which("intel_gpu_top")
    if not binary:
        return 0.0
    try:
        proc = subprocess.run(
            [binary, "-J", "-s", "1"],
            capture_output=True,
            text=True,
            timeout=1.5,
            check=False,
        )
        output = proc.stdout or ""
        if "Render/3D" in output:
            match = re.search(r'"Render/3D":\s*\{\s*"busy":\s*([\d.]+)', output)
            if match:
                return max(0.0, min(100.0, float(match.group(1))))
    except Exception:
        pass
    return 0.0


def heartbeat_loop(
    cfg: AgentConfig,
    cloud_client: CloudClient,
    state_store: DesiredStateStore,
    stop_event: threading.Event,
) -> None:
    """Periodically publish hardware telemetry and apply desiredState from Cloudflare."""
    specs = get_server_specs()
    print(f"[INFO] Host specs: {specs}")

    if not cloud_client.enabled:
        print("[WARN] CLOUDFLARE_API_BASE or MONITOR_AGENT_KEY not set; running in local MJPEG-only mode.")
        return

    # Prime psutil cpu_percent baseline before loop
    psutil.cpu_percent(interval=None)

    while not stop_event.is_set():
        try:
            cpu = float(psutil.cpu_percent(interval=1.0))
            mem = float(psutil.virtual_memory().percent)
            gpu = read_intel_gpu_busy()

            desired_state = cloud_client.send_heartbeat(cpu=cpu, mem=mem, gpu=gpu, server_specs=specs)
            if desired_state is not None and state_store.update_from_cloud(desired_state):
                print(f"[SYNC] Desired state updated from cloud: {state_store.snapshot()}")
        except Exception as exc:
            print(f"[HEARTBEAT][WARN] Unexpected telemetry error: {exc}")

        remaining = max(0.5, cfg.heartbeat_interval_sec - 1.0)
        stop_event.wait(remaining)


def main() -> None:
    cfg = AgentConfig.from_env()
    stop_event = threading.Event()

    def _handle_signal(signum: int, _frame: Any) -> None:
        print(f"\n[INFO] Received signal {signum}, shutting down...")
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _handle_signal)

    camera_names = tuple(cam.name for cam in cfg.cameras) or ("cam1", "cam2")
    frame_store = FrameStore(camera_names=camera_names)
    state_store = DesiredStateStore()
    cloud_client = CloudClient(cfg.cloudflare_api_base, cfg.monitor_agent_key)

    stream_server: StreamServer | None = None
    if cfg.mjpeg_port > 0:
        stream_server = StreamServer(cfg.mjpeg_host, cfg.mjpeg_port, frame_store, stop_event)
        stream_server.start()

    threads: list[threading.Thread] = []

    t_heartbeat = threading.Thread(
        target=heartbeat_loop,
        args=(cfg, cloud_client, state_store, stop_event),
        name="cloud-heartbeat",
        daemon=True,
    )
    t_heartbeat.start()
    threads.append(t_heartbeat)

    if not cfg.cameras:
        print("[WARN] No cameras configured (CAM1_RTSP_URL / CAM2_RTSP_URL are empty).")

    for cam in cfg.cameras:
        print(f"[INFO] Configured {cam.name}: {redact_rtsp_url(cam.rtsp_url)} (threshold={cam.threshold})")
        t_cam = threading.Thread(
            target=run_camera_worker,
            args=(cam, cfg, state_store, frame_store, cloud_client, stop_event),
            name=f"camera-{cam.name}",
            daemon=True,
        )
        t_cam.start()
        threads.append(t_cam)

    try:
        while not stop_event.is_set():
            stop_event.wait(0.5)
    finally:
        stop_event.set()
        if stream_server is not None:
            stream_server.stop()
        for t in threads:
            if t.is_alive():
                t.join(timeout=2.0)
        cloud_client.close()
        print("[INFO] CV Edge Agent stopped cleanly.")


if __name__ == "__main__":
    main()
