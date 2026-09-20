import math
from typing import List, Dict, Any, Optional, Tuple

class TrackedObject:
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
        self.velocity: Tuple[float, float] = (0.0, 0.0)
        self.speed_mps: float = 0.0
        self.direction_str: str = "Stationary"
        self.status = "ACTIVE"

    def get_center(self) -> Tuple[float, float]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    def update(self, bbox: Tuple[float, float, float, float], confidence: float, timestamp: float):
        old_center = self.get_center()
        self.previous_bbox = self.bbox
        self.bbox = bbox
        self.confidence = confidence
        dt = max(0.01, timestamp - self.last_seen)
        self.last_seen = timestamp

        new_center = self.get_center()
        vx = (new_center[0] - old_center[0]) / dt
        vy = (new_center[1] - old_center[1]) / dt
        self.velocity = (vx, vy)

        self.history.append(new_center)
        if len(self.history) > 35:
            self.history.pop(0)

        # Multi-frame windowed velocity & direction estimation (robust against single-frame detector jitter)
        window_size = min(6, len(self.history))
        if window_size >= 2:
            start_pos = self.history[-window_size]
            dt_window = max(0.03, (window_size - 1) * dt)
            net_dx = new_center[0] - start_pos[0]
            net_dy = new_center[1] - start_pos[1]
            net_disp = math.sqrt(net_dx**2 + net_dy**2)
            self.speed_mps = round((net_disp * 25.0) / dt_window, 1)

            # Check if moving or stationary
            if net_disp > 0.004 or self.speed_mps > 0.4:
                # Border line nominal altitude is at y ~ 0.42
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
        if self.time_since_update > 5:
            self.status = "EXITED"

    @property
    def dwell_time(self) -> float:
        return round(max(0.0, self.last_seen - self.first_seen), 1)

    def to_dict(self) -> Dict[str, Any]:
        return {
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
    def __init__(self, max_age: int = 15, min_iou: float = 0.25):
        self.max_age = max_age
        self.min_iou = min_iou
        self.next_track_id = 1
        self.tracks: Dict[int, TrackedObject] = {}
        self.all_lifetime_tracks: Dict[int, TrackedObject] = {}

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

    def update(self, detections: List[Dict[str, Any]], current_timestamp: float = 0.0) -> List[Dict[str, Any]]:
        matched_tracks = set()
        matched_dets = set()

        sorted_det_indices = sorted(range(len(detections)), key=lambda i: detections[i]['confidence'], reverse=True)

        for d_idx in sorted_det_indices:
            det = detections[d_idx]
            det_bbox = det['bbox']
            det_cat = det.get('category', 'person')
            bytetrack_id = det.get('tracking_id')

            best_iou = self.min_iou
            best_tid = None

            # 1. Direct ByteTrack ID match if available
            if bytetrack_id is not None and bytetrack_id in self.tracks:
                best_tid = bytetrack_id
            else:
                # 2. IoU-based matching fallback
                for tid, track in self.tracks.items():
                    if tid in matched_tracks:
                        continue
                    if track.category != det_cat and track.time_since_update < 3:
                        continue

                    iou = self.compute_iou(det_bbox, track.bbox)
                    if iou > best_iou:
                        best_iou = iou
                        best_tid = tid

            if best_tid is not None:
                track = self.tracks[best_tid]
                det['previous_bbox'] = track.bbox
                track.update(det_bbox, det['confidence'], current_timestamp)
                matched_tracks.add(best_tid)
                matched_dets.add(d_idx)
                det['tracking_id'] = best_tid
                det['category'] = track.category
                det['velocity'] = track.velocity
                det['speed'] = f"Est. {track.speed_mps} px/s"
                det['direction'] = track.direction_str
                det['dwell_time'] = f"{int(track.dwell_time)} sec"
                det['history'] = track.history

        # New tracks for unmatched detections
        for d_idx in range(len(detections)):
            if d_idx not in matched_dets:
                det = detections[d_idx]
                bytetrack_id = det.get('tracking_id')
                if bytetrack_id is not None:
                    tid = bytetrack_id
                    if tid >= self.next_track_id:
                        self.next_track_id = tid + 1
                else:
                    tid = self.next_track_id
                    self.next_track_id += 1

                cls_name = det.get('class', 'person')
                cat_name = det.get('category', 'person')
                new_track = TrackedObject(
                    track_id=tid,
                    bbox=det['bbox'],
                    object_class=cls_name,
                    category=cat_name,
                    confidence=det['confidence'],
                    timestamp=current_timestamp
                )
                self.tracks[tid] = new_track
                self.all_lifetime_tracks[tid] = new_track
                matched_tracks.add(tid)
                matched_dets.add(d_idx)
                det['tracking_id'] = tid
                det['category'] = cat_name
                det['velocity'] = (0.0, 0.0)
                det['speed'] = "Est. 0.0 px/s"
                det['direction'] = "Stationary"
                det['dwell_time'] = "0 sec"
                det['history'] = new_track.history
                det['previous_bbox'] = None
                det['velocity'] = (0.0, 0.0)
                det['speed'] = "0.0 px/s"
                det['direction'] = "Stationary"
                det['dwell_time'] = "0 sec"
                det['history'] = new_track.history

        # Stale tracks
        stale_tracks = []
        for tid, track in self.tracks.items():
            if tid not in matched_tracks:
                track.mark_missed()
                if track.time_since_update > self.max_age:
                    stale_tracks.append(tid)

        for tid in stale_tracks:
            del self.tracks[tid]

        return detections

    def get_active_entities(self) -> List[Dict[str, Any]]:
        return [t.to_dict() for t in self.tracks.values() if t.status == "ACTIVE"]

    def get_counts(self) -> Dict[str, int]:
        active = [t for t in self.tracks.values() if t.status == "ACTIVE"]
        return {
            "persons": sum(1 for t in active if t.category == "person"),
            "vehicles": sum(1 for t in active if t.category == "vehicle"),
            "animals": sum(1 for t in active if t.category == "animal"),
            "active_tracks": len(active)
        }
