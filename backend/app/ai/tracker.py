import math
from typing import List, Dict, Any, Optional, Tuple

class TrackedObject:
    """
    State container for an individual tracked surveillance target.
    Maintains persistent identity, multi-frame movement history, velocity vector,
    speed estimation, trajectory direction, and lifecycle states.
    """
    def __init__(
        self,
        track_id: int,
        bbox: Tuple[float, float, float, float],
        object_class: str,
        category: str,
        confidence: float,
        timestamp: float
    ):
        self.track_id = track_id
        self.bbox = bbox # (x1, y1, x2, y2) normalized [0, 1]
        self.previous_bbox: Optional[Tuple[float, float, float, float]] = None
        self.object_class = object_class
        self.category = category
        self.confidence = confidence
        self.first_seen = timestamp
        self.last_seen = timestamp
        self.age = 1
        self.hits = 1
        self.time_since_update = 0
        self.history: List[Tuple[float, float]] = [self.get_center()]
        self.velocity: Tuple[float, float] = (0.0, 0.0) # (vx, vy) normalized per second
        self.speed_mps: float = 0.0
        self.direction_str: str = "Stationary"
        self.status = "ACTIVE" # "ACTIVE", "COASTING", "LOST", "EXPIRED"

    def get_center(self) -> Tuple[float, float]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    def get_predicted_bbox(self, dt: float = 0.033) -> Tuple[float, float, float, float]:
        """
        Predicts future bounding box using exponential smoothed velocity vector.
        Prevents premature track loss during rapid motion or brief occlusion.
        """
        x1, y1, x2, y2 = self.bbox
        vx, vy = self.velocity

        # Dampen velocity extrapolation progressively if missed for multiple frames
        damp = max(0.1, 1.0 - 0.12 * self.time_since_update)
        effective_dt = max(0.01, min(0.5, dt * (self.time_since_update + 1)))

        dx = vx * effective_dt * damp
        dy = vy * effective_dt * damp

        w = x2 - x1
        h = y2 - y1

        px1 = max(0.0, min(1.0 - w, x1 + dx))
        py1 = max(0.0, min(1.0 - h, y1 + dy))
        px2 = min(1.0, px1 + w)
        py2 = min(1.0, py1 + h)

        return (px1, py1, px2, py2)

    def update(self, bbox: Tuple[float, float, float, float], confidence: float, timestamp: float):
        old_center = self.get_center()
        self.previous_bbox = self.bbox
        self.bbox = bbox
        self.confidence = confidence

        dt = max(0.01, timestamp - self.last_seen)
        self.last_seen = timestamp

        new_center = self.get_center()
        raw_vx = (new_center[0] - old_center[0]) / dt
        raw_vy = (new_center[1] - old_center[1]) / dt

        # Smooth velocity using Exponential Moving Average (EMA) to reject single-frame YOLO jitter
        alpha = 0.65
        self.velocity = (
            alpha * raw_vx + (1.0 - alpha) * self.velocity[0],
            alpha * raw_vy + (1.0 - alpha) * self.velocity[1]
        )

        self.history.append(new_center)
        if len(self.history) > 40:
            self.history.pop(0)

        # Multi-frame windowed velocity & direction estimation
        window_size = min(6, len(self.history))
        if window_size >= 2:
            start_pos = self.history[-window_size]
            dt_window = max(0.03, (window_size - 1) * dt)
            net_dx = new_center[0] - start_pos[0]
            net_dy = new_center[1] - start_pos[1]
            net_disp = math.sqrt(net_dx**2 + net_dy**2)
            self.speed_mps = round((net_disp * 25.0) / dt_window, 1)

            # Direction assessment relative to border perimeter (y ~ 0.42)
            if net_disp > 0.003 or self.speed_mps > 0.3:
                approaching = (new_center[1] > 0.42 and net_dy < -0.002) or (new_center[1] < 0.42 and net_dy > 0.002)
                if approaching:
                    self.direction_str = "Towards Border"
                elif abs(net_dx) > abs(net_dy):
                    self.direction_str = "Parallel to Fence"
                else:
                    self.direction_str = "Moving Away"
            else:
                self.direction_str = "Stationary"
        else:
            self.speed_mps = 0.0
            self.direction_str = "Stationary"

        self.hits += 1
        self.time_since_update = 0
        self.age += 1
        self.status = "ACTIVE"

    def mark_missed(self):
        self.time_since_update += 1
        self.age += 1
        if self.time_since_update <= 3:
            self.status = "ACTIVE"
        elif self.time_since_update <= 8:
            self.status = "COASTING"
        else:
            self.status = "LOST"

    @property
    def dwell_time(self) -> float:
        return round(max(0.0, self.last_seen - self.first_seen), 1)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "tracking_id": self.track_id,
            "object_class": self.object_class,
            "category": self.category,
            "confidence": round(self.confidence, 3),
            "first_seen": round(self.first_seen, 2),
            "last_seen": round(self.last_seen, 2),
            "dwell_time": f"{int(self.dwell_time)} sec",
            "speed": f"Est. {self.speed_mps} px/s",
            "direction": self.direction_str,
            "status": self.status,
            "hits": self.hits,
            "velocity": (round(self.velocity[0], 4), round(self.velocity[1], 4)),
            "bbox": [round(c, 4) for c in self.bbox]
        }


class MultiObjectTracker:
    """
    Dedicated Multi-Target Association Engine.
    Ensures per-camera isolation, monotonic track IDs, velocity-guided prediction,
    strict category matching, zero duplicate tracks, and clean lifecycle management.
    """
    def __init__(self, max_age: int = 30, min_iou: float = 0.20, max_center_dist: float = 0.12):
        self.max_age = max_age
        self.min_iou = min_iou
        self.max_center_dist = max_center_dist
        self.next_track_id = 1
        self.tracks: Dict[int, TrackedObject] = {}
        self.all_lifetime_tracks: Dict[int, TrackedObject] = {}
        self.last_timestamp = 0.0

    def reset(self):
        """Cleanly flushes tracking state upon video restart or camera switch."""
        self.tracks.clear()
        self.all_lifetime_tracks.clear()
        self.next_track_id = 1
        self.last_timestamp = 0.0

    @staticmethod
    def compute_iou(boxA: Tuple[float, float, float, float], boxB: Tuple[float, float, float, float]) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
        boxAArea = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
        boxBArea = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])

        unionArea = boxAArea + boxBArea - interArea
        if unionArea <= 0:
            return 0.0
        return interArea / unionArea

    @staticmethod
    def compute_centroid_dist(boxA: Tuple[float, float, float, float], boxB: Tuple[float, float, float, float]) -> float:
        cA = ((boxA[0] + boxA[2]) / 2.0, (boxA[1] + boxA[3]) / 2.0)
        cB = ((boxB[0] + boxB[2]) / 2.0, (boxB[1] + boxB[3]) / 2.0)
        return math.sqrt((cA[0] - cB[0])**2 + (cA[1] - cB[1])**2)

    def update(self, detections: List[Dict[str, Any]], current_timestamp: float = 0.0) -> List[Dict[str, Any]]:
        """
        Associates incoming YOLO detections to existing tracks using 2-stage association:
        Stage 1: Predicted bounding box IoU overlap.
        Stage 2: Centroid proximity matching for fast targets / scale fluctuations.
        Guarantees strict 1-to-1 association with zero duplicate tracks per frame.
        """
        dt = max(0.01, current_timestamp - self.last_timestamp) if self.last_timestamp > 0 else 0.033
        self.last_timestamp = current_timestamp

        matched_tracks = set()
        matched_dets = set()

        if detections:
            # Sort detections by confidence descending so highest confidence detections get priority
            sorted_det_indices = sorted(range(len(detections)), key=lambda i: detections[i].get('confidence', 0.0), reverse=True)

            # Stage 1: Greedy IoU matching using predicted bboxes
            iou_candidates = []
            for d_idx in sorted_det_indices:
                det = detections[d_idx]
                det_bbox = det['bbox']
                det_cat = det.get('category', 'person')

                for tid, track in self.tracks.items():
                    # Strict category check: a person track NEVER matches a vehicle or animal
                    if track.category != det_cat:
                        continue

                    pred_bbox = track.get_predicted_bbox(dt)
                    iou_pred = self.compute_iou(det_bbox, pred_bbox)
                    iou_curr = self.compute_iou(det_bbox, track.bbox)
                    best_iou = max(iou_pred, iou_curr)

                    if best_iou >= self.min_iou:
                        iou_candidates.append((best_iou, d_idx, tid))

            # Assign greedy IoU matches
            iou_candidates.sort(key=lambda x: x[0], reverse=True)
            for score, d_idx, tid in iou_candidates:
                if d_idx in matched_dets or tid in matched_tracks:
                    continue
                matched_dets.add(d_idx)
                matched_tracks.add(tid)
                self._apply_match(detections[d_idx], self.tracks[tid], current_timestamp)

            # Stage 2: Centroid proximity matching for unmatched detections (handles fast-moving targets)
            dist_candidates = []
            for d_idx in sorted_det_indices:
                if d_idx in matched_dets:
                    continue
                det = detections[d_idx]
                det_bbox = det['bbox']
                det_cat = det.get('category', 'person')

                for tid, track in self.tracks.items():
                    if tid in matched_tracks:
                        continue
                    if track.category != det_cat:
                        continue

                    pred_bbox = track.get_predicted_bbox(dt)
                    dist_pred = self.compute_centroid_dist(det_bbox, pred_bbox)
                    dist_curr = self.compute_centroid_dist(det_bbox, track.bbox)
                    best_dist = min(dist_pred, dist_curr)

                    if best_dist <= self.max_center_dist:
                        dist_candidates.append((best_dist, d_idx, tid))

            # Assign greedy centroid matches (lowest distance first)
            dist_candidates.sort(key=lambda x: x[0])
            for dist, d_idx, tid in dist_candidates:
                if d_idx in matched_dets or tid in matched_tracks:
                    continue
                matched_dets.add(d_idx)
                matched_tracks.add(tid)
                self._apply_match(detections[d_idx], self.tracks[tid], current_timestamp)

        # Stage 3: Create new tracks for genuine unmatched detections
        for d_idx in range(len(detections)):
            if d_idx not in matched_dets:
                det = detections[d_idx]
                tid = self.next_track_id
                self.next_track_id += 1

                # Guarantee uniqueness
                while tid in self.tracks or tid in self.all_lifetime_tracks:
                    tid = self.next_track_id
                    self.next_track_id += 1

                cls_name = det.get('class', 'person')
                cat_name = det.get('category', 'person')
                conf = det.get('confidence', 0.5)

                new_track = TrackedObject(
                    track_id=tid,
                    bbox=det['bbox'],
                    object_class=cls_name,
                    category=cat_name,
                    confidence=conf,
                    timestamp=current_timestamp
                )
                self.tracks[tid] = new_track
                self.all_lifetime_tracks[tid] = new_track

                matched_tracks.add(tid)
                matched_dets.add(d_idx)

                det['tracking_id'] = tid
                det['previous_bbox'] = None
                det['category'] = cat_name
                det['velocity'] = (0.0, 0.0)
                det['speed'] = "Est. 0.0 px/s"
                det['direction'] = "Stationary"
                det['dwell_time'] = "0 sec"
                det['history'] = new_track.history

        # Stage 4: Handle disappeared / missed tracks & expire after max_age
        stale_tracks = []
        for tid, track in self.tracks.items():
            if tid not in matched_tracks:
                track.mark_missed()
                if track.time_since_update > self.max_age:
                    stale_tracks.append(tid)

        for tid in stale_tracks:
            self.tracks[tid].status = "EXPIRED"
            del self.tracks[tid]

        return detections

    def _apply_match(self, det: Dict[str, Any], track: TrackedObject, current_timestamp: float):
        """Enriches detection dictionary and updates track state."""
        det['previous_bbox'] = track.bbox
        track.update(det['bbox'], det.get('confidence', track.confidence), current_timestamp)
        det['tracking_id'] = track.track_id
        det['category'] = track.category
        det['velocity'] = track.velocity
        det['speed'] = f"Est. {track.speed_mps} px/s"
        det['direction'] = track.direction_str
        det['dwell_time'] = f"{int(track.dwell_time)} sec"
        det['history'] = track.history

    def get_active_entities(self) -> List[Dict[str, Any]]:
        """Returns currently active or coasting tracks."""
        return [t.to_dict() for t in self.tracks.values() if t.status in ("ACTIVE", "COASTING")]

    def get_counts(self) -> Dict[str, int]:
        active = [t for t in self.tracks.values() if t.status in ("ACTIVE", "COASTING")]
        return {
            "persons": sum(1 for t in active if t.category == "person"),
            "vehicles": sum(1 for t in active if t.category == "vehicle"),
            "animals": sum(1 for t in active if t.category == "animal"),
            "active_tracks": len(active)
        }
