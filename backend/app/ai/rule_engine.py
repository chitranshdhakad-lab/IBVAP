import math
from typing import List, Tuple, Dict, Any, Optional

class TrackIncidentState:
    """State machine tracking active boundary events and incident lifecycle per object ID."""
    def __init__(self):
        self.in_restricted_zone: bool = False
        self.near_fence: bool = False
        self.approaching_fence: bool = False
        self.has_loiter_alerted: bool = False
        self.has_crossed_border: bool = False
        self.last_alert_time: float = -999.0
        self.last_event_type: Optional[str] = None
        self.zone_entry_time: float = -999.0
        self.zone_cleared_time: float = -999.0


class TacticalRuleEngine:
    """
    Tactical Border Rule Engine evaluating:
      - Restricted Zone Breach & Zone Exits
      - Real Finite Line Segment Distance & Proximity
      - Trajectory Border Line Crossing
      - Movement Direction Relative to Border Line
      - Loitering & Dwell Time Escalation
      - Debounce & Cooldown Enforcement
      - Clean Incident Lifecycle & Memory Management
    """
    def __init__(self, debounce_seconds: float = 3.0, loiter_threshold_seconds: float = 4.0):
        self.debounce_seconds = debounce_seconds
        self.loiter_threshold = loiter_threshold_seconds
        self.track_states: Dict[int, TrackIncidentState] = {}
        self.track_entry_times: Dict[int, float] = {}

    def reset(self):
        """Cleanly flushes rule engine states."""
        self.track_states.clear()
        self.track_entry_times.clear()

    def cleanup_expired_tracks(self, active_track_ids: List[int]):
        """Prunes tracking states for departed objects to prevent memory leaks."""
        active_set = set(active_track_ids)
        expired = [tid for tid in self.track_states.keys() if tid not in active_set]
        for tid in expired:
            del self.track_states[tid]
            if tid in self.track_entry_times:
                del self.track_entry_times[tid]

    @staticmethod
    def point_in_polygon(point: Tuple[float, float], polygon: List[List[float]]) -> bool:
        """Standard ray casting algorithm for 2D polygon inclusion test."""
        if not polygon or len(polygon) < 3:
            return False

        x, y = point
        n = len(polygon)
        inside = False

        p1x, p1y = polygon[0]
        for i in range(n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y

        return inside

    @staticmethod
    def distance_to_line_segment(point: Tuple[float, float], line: List[List[float]]) -> float:
        """
        Calculates exact Euclidean distance to a finite 2D line segment [p1, p2].
        Uses clamped orthogonal projection (t in [0.0, 1.0]) to avoid infinite line artifacts.
        Scale factor: 1.0 normalized screen distance ~ 50.0 meters in tactical view.
        """
        if not line or len(line) < 2:
            return 30.0

        x0, y0 = point
        x1, y1 = line[0]
        x2, y2 = line[1]

        dx = x2 - x1
        dy = y2 - y1
        l2 = dx * dx + dy * dy

        if l2 <= 1e-7:
            # Degenerate point line
            dist_norm = math.sqrt((x0 - x1)**2 + (y0 - y1)**2)
            return round(dist_norm * 50.0, 1)

        # Clamped projection factor onto segment
        t = max(0.0, min(1.0, ((x0 - x1) * dx + (y0 - y1) * dy) / l2))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy

        dist_norm = math.sqrt((x0 - proj_x)**2 + (y0 - proj_y)**2)
        return round(dist_norm * 50.0, 1)

    @staticmethod
    def segments_intersect(p1: Tuple[float, float], p2: Tuple[float, float], q1: Tuple[float, float], q2: Tuple[float, float]) -> bool:
        """Determines whether segment (p1, p2) intersects segment (q1, q2)."""
        def ccw(A, B, C):
            return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

        return (ccw(p1, q1, q2) != ccw(p2, q1, q2)) and (ccw(p1, p2, q1) != ccw(p1, p2, q2))

    def evaluate(
        self,
        tracking_id: int,
        bbox: Tuple[float, float, float, float],
        previous_bbox: Optional[Tuple[float, float, float, float]],
        video_timestamp: float,
        restricted_zone: Optional[List[List[float]]],
        border_line: Optional[List[List[float]]],
        object_class: str = "person",
        category: str = "person",
        direction_str: str = "Stationary",
        dwell_seconds: float = 0.0
    ) -> Dict[str, Any]:
        """
        Evaluates real-time tactical boundary rules on tracked object.
        Returns evaluation packet with alert triggers, distance, event classification, and severity.
        """
        x1, y1, x2, y2 = bbox
        bottom_point = ((x1 + x2) / 2.0, y2)
        center_point = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

        # 1. Zone inclusion (using bottom anchor point representing ground footprint)
        is_inside_zone = False
        if restricted_zone and len(restricted_zone) >= 3:
            is_inside_zone = (
                self.point_in_polygon(bottom_point, restricted_zone) or
                self.point_in_polygon(center_point, restricted_zone)
            )

        # 2. Finite line segment fence distance
        dist_to_fence = 50.0
        if border_line and len(border_line) >= 2:
            dist_to_fence = self.distance_to_line_segment(bottom_point, border_line)

        # 3. Trajectory line crossing detection
        crossed_border = False
        if previous_bbox and border_line and len(border_line) >= 2:
            prev_center = ((previous_bbox[0] + previous_bbox[2]) / 2.0, (previous_bbox[1] + previous_bbox[3]) / 2.0)
            q1 = (border_line[0][0], border_line[0][1])
            q2 = (border_line[1][0], border_line[1][1])
            crossed_border = self.segments_intersect(prev_center, center_point, q1, q2)

        # Retrieve or initialize incident state for this tracking ID
        if tracking_id not in self.track_states:
            self.track_states[tracking_id] = TrackIncidentState()
        state = self.track_states[tracking_id]

        should_alert = False
        event_type = None
        severity = "Low"
        is_exit_event = False

        # RULE 1: Border Line Crossing (Critical Severity Priority)
        if crossed_border and not state.has_crossed_border:
            state.has_crossed_border = True
            event_type = "Border crossing detected"
            severity = "Critical"
            should_alert = True
            state.last_alert_time = video_timestamp
            state.last_event_type = event_type

        # RULE 2: Restricted Zone Breach, Loitering, and Exit
        elif is_inside_zone:
            if tracking_id not in self.track_entry_times:
                self.track_entry_times[tracking_id] = video_timestamp

            # Loitering escalation inside restricted zone
            if dwell_seconds >= self.loiter_threshold and not state.has_loiter_alerted:
                state.has_loiter_alerted = True
                event_type = "Loitering in restricted zone"
                severity = "Critical" if category == "person" else "High"
                should_alert = True
                state.last_alert_time = video_timestamp
                state.last_event_type = event_type
            elif not state.in_restricted_zone:
                # State transition: OUTSIDE -> INSIDE (New breach initiated)
                state.in_restricted_zone = True
                if (video_timestamp - state.last_alert_time) >= self.debounce_seconds:
                    if category == "person":
                        event_type = "Zone breach"
                        severity = "Critical"
                    elif category == "vehicle":
                        event_type = "Vehicle detected"
                        severity = "High"
                    else:
                        event_type = "Animal detected"
                        severity = "Medium"
                    should_alert = True
                    state.last_alert_time = video_timestamp
                    state.last_event_type = event_type

        else:
            # Target is currently OUTSIDE the restricted zone
            if state.in_restricted_zone:
                # State transition: INSIDE -> OUTSIDE (Zone Breach Cleared / Exited)
                state.in_restricted_zone = False
                state.zone_cleared_time = video_timestamp
                event_type = "Zone breach cleared"
                severity = "Low"
                is_exit_event = True
                should_alert = True
                state.last_alert_time = video_timestamp
                state.last_event_type = event_type

            # RULE 3: Border Fence Proximity & Approach Vector
            elif dist_to_fence <= 25.0:
                if not state.near_fence:
                    state.near_fence = True
                    if (video_timestamp - state.last_alert_time) >= self.debounce_seconds:
                        if dist_to_fence <= 14.0:
                            if direction_str == "Towards Border":
                                event_type = "Movement towards fence"
                                severity = "Critical"
                            elif dwell_seconds >= 1.5 or direction_str == "Stationary":
                                event_type = "Stationary target near border fence"
                                severity = "High"
                            else:
                                event_type = "Perimeter fence proximity alert"
                                severity = "High"
                        else:
                            if category == "person":
                                event_type = "Perimeter buffer zone detection"
                                severity = "High"
                            elif category == "vehicle":
                                event_type = "Vehicle near border line"
                                severity = "Medium"
                            else:
                                event_type = "Animal in sector perimeter"
                                severity = "Low"
                        should_alert = True
                        state.last_alert_time = video_timestamp
                        state.last_event_type = event_type
                elif dwell_seconds >= self.loiter_threshold and not state.has_loiter_alerted:
                    # Lingering in proximity corridor
                    state.has_loiter_alerted = True
                    event_type = "Perimeter fence loitering"
                    severity = "Critical" if category == "person" else "High"
                    should_alert = True
                    state.last_alert_time = video_timestamp
                    state.last_event_type = event_type

            else:
                # Target is beyond 25m from fence and outside restricted zone
                state.near_fence = False

                # RULE 4: Sector Loitering (Persons lingering in view without zone violation)
                if category == "person" and dwell_seconds >= self.loiter_threshold and not state.has_loiter_alerted:
                    if (video_timestamp - state.last_alert_time) >= self.debounce_seconds:
                        state.has_loiter_alerted = True
                        event_type = "Unidentified person in sector"
                        severity = "Medium"
                        should_alert = True
                        state.last_alert_time = video_timestamp
                        state.last_event_type = event_type

        return {
            "is_in_restricted_zone": is_inside_zone,
            "distance_to_fence": f"{int(dist_to_fence)} m",
            "distance_meters": dist_to_fence,
            "should_alert": should_alert,
            "event_type": event_type,
            "severity": severity,
            "is_exit_event": is_exit_event,
            "crossed_border": crossed_border
        }
