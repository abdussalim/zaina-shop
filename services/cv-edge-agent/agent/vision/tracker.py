"""Centroid-based multi-object tracker for person entry/exit counting."""

from __future__ import annotations

import numpy as np
from scipy.spatial import distance


class CentroidTracker:
    """Associates detected bounding boxes across frames by Euclidean centroid distance."""

    def __init__(self, max_disappeared: int = 15, max_distance: float = 50) -> None:
        self.next_object_id = 0
        self.objects: dict[int, tuple[int, int]] = {}
        self.disappeared: dict[int, int] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def register(self, centroid: tuple[int, int] | np.ndarray) -> int:
        obj_id = self.next_object_id
        self.objects[obj_id] = (int(centroid[0]), int(centroid[1]))
        self.disappeared[obj_id] = 0
        self.next_object_id += 1
        return obj_id

    def deregister(self, object_id: int) -> None:
        self.objects.pop(object_id, None)
        self.disappeared.pop(object_id, None)

    def reset(self) -> None:
        self.objects.clear()
        self.disappeared.clear()

    def update(self, rects: list[tuple[int, int, int, int, float]]) -> dict[int, tuple[int, int]]:
        if len(rects) == 0:
            for object_id in list(self.disappeared.keys()):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)
            return dict(self.objects)

        input_centroids = np.zeros((len(rects), 2), dtype="int")
        for i, (start_x, start_y, end_x, end_y, _) in enumerate(rects):
            cx = int((start_x + end_x) / 2.0)
            cy = int((start_y + end_y) / 2.0)
            input_centroids[i] = (cx, cy)

        if len(self.objects) == 0:
            for i in range(len(input_centroids)):
                self.register(input_centroids[i])
        else:
            object_ids = list(self.objects.keys())
            object_centroids = list(self.objects.values())

            distances = distance.cdist(np.array(object_centroids), input_centroids)
            rows = distances.min(axis=1).argsort()
            cols = distances.argmin(axis=1)[rows]

            used_rows: set[int] = set()
            used_cols: set[int] = set()

            for row, col in zip(rows, cols):
                if row in used_rows or col in used_cols:
                    continue
                if distances[row, col] > self.max_distance:
                    continue

                object_id = object_ids[row]
                self.objects[object_id] = (int(input_centroids[col][0]), int(input_centroids[col][1]))
                self.disappeared[object_id] = 0

                used_rows.add(row)
                used_cols.add(col)

            unused_rows = set(range(distances.shape[0])).difference(used_rows)
            unused_cols = set(range(distances.shape[1])).difference(used_cols)

            if distances.shape[0] >= distances.shape[1]:
                for row in unused_rows:
                    object_id = object_ids[row]
                    self.disappeared[object_id] += 1
                    if self.disappeared[object_id] > self.max_disappeared:
                        self.deregister(object_id)
            else:
                for col in unused_cols:
                    self.register(input_centroids[col])

        return dict(self.objects)
