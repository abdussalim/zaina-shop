"""OpenVINO person detector with automatic GPU -> CPU fallback."""

from __future__ import annotations

import cv2
import numpy as np
from openvino import Core


class PersonDetector:
    """Runs OpenVINO `person-detection-0200` inference on BGR frames."""

    def __init__(self, model_path: str, device: str = "GPU") -> None:
        self.ie = Core()
        self.model = self.ie.read_model(model=model_path)
        try:
            self.compiled_model = self.ie.compile_model(self.model, device)
            self.active_device = device
            print(f"[INFO] Initialized OpenVINO model on {device}")
        except Exception as exc:
            print(f"[WARN] Failed to initialize {device}, falling back to CPU: {exc}")
            self.compiled_model = self.ie.compile_model(self.model, "CPU")
            self.active_device = "CPU"
            print("[INFO] Initialized OpenVINO model on CPU")

        self.input_layer = self.compiled_model.input(0)
        self.output_layer = self.compiled_model.output(0)
        _, _, self.h, self.w = self.input_layer.shape

    def detect(self, frame: np.ndarray, conf_threshold: float = 0.5) -> list[tuple[int, int, int, int, float]]:
        """Detect person bounding boxes `(xmin, ymin, xmax, ymax, confidence)`."""
        resized = cv2.resize(frame, (self.w, self.h))
        input_data = resized.transpose(2, 0, 1)
        input_data = np.expand_dims(input_data, axis=0).astype(np.float32)

        result = self.compiled_model([input_data])[self.output_layer]

        boxes: list[tuple[int, int, int, int, float]] = []
        h_frame, w_frame, _ = frame.shape

        for detection in result[0][0]:
            confidence = float(detection[2])
            if confidence > conf_threshold:
                xmin = max(0, min(w_frame - 1, int(detection[3] * w_frame)))
                ymin = max(0, min(h_frame - 1, int(detection[4] * h_frame)))
                xmax = max(xmin + 1, min(w_frame, int(detection[5] * w_frame)))
                ymax = max(ymin + 1, min(h_frame, int(detection[6] * h_frame)))
                boxes.append((xmin, ymin, xmax, ymax, confidence))

        return boxes
