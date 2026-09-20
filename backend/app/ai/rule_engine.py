import math
from typing import List, Tuple, Dict, Any, Optional

class TrackIncidentState:
    """State machine tracking active boundary events per object ID."""
    def __init__(self):
        self.in_restricted_zone: bool = False
        self.approaching_fence: bool = False
        self.has_loiter_alerted: bool = False
        self.last_alert_time: float = -999.0
        self.zone_cleared_time: float = -999.0

class TacticalRuleEngine:
    """
    Tactical Border Rule Engine evaluating:
      - Restricted Zone Breach
      - Border approach direction
      - Loitering
      - Dwell time & fence proximity
    Implements proper incident state transition and configurable cooldown.
    """
    def __init__(self, debounce_seconds: float = 3.0, loiter_threshold_seconds: float = 4.0):
        self.debounce_seconds = debounce_seconds
        self.loiter_threshold = loiter_threshold_seconds
        self.track_states: Dict[int, TrackIncidentState] = {}
        self.track_entry_times: Dict[int, float] = {}

    @staticmethod
    def point_in_polygon(point: Tuple[float, float], polygon: List[List[float]]) -> bool:
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
    def distance_to_line(point: Tuple[float, float], line: List[List[float]]) -> float:
        """Returns approximate distance in meters to a 2D line segment."""
        if not line or len(line) < 2:
            return 25.0
        p1 = line[0]
        p2 = line[1]
        x0, y0 = point
        x1, y1 = p1
        x2, y2 = p2
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = math.sqrt((y2 - y1)**2 + (x2 - x1)**2)
        if den == 0:
            return 25.0
        norm_dist = num / den
        # Approximate 1.0 normalized distance ~ 50 meters in tactical camera view
        return round(norm_dist * 50.0, 1)

    def evaluate(
        self,
        tracking_id: int,
        bbox: Tuple[float, float, float, float],
        video_timestamp: float,
        restricted_zone: Optional[List[List[float]]],
        border_line: Optional[List[List[float]]],
        object_class: str = "person",
        category: str = "person",
        direction_str: str = "Stationary",
        dwell_seconds: float = 0.0
    ) -> Dict[str, Any]:
        x1, y1, x2, y2 = bbox
        bottom_point = ((x1 + x2) / 2.0, y2)
        center_point = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

        is_inside = False
        if restricted_zone and len(restricted_zone) >= 3:
            is_inside = self.point_in_polygon(bottom_point, restricted_zone) or self.point_in_polygon(center_point, restricted_zone)

        dist_to_fence = self.distance_to_line(bottom_point, border_line)

        # Retrieve or initialize state for tracking ID
        if tracking_id not in self.track_states:
            self.track_states[tracking_id] = TrackIncidentState()
        state = self.track_states[tracking_id]

        should_alert = False
        event_type = None
        severity = "Low"

        # 1. Restricted Zone Breach Logic
        if is_inside:
            if tracking_id not in self.track_entry_times:
                self.track_entry_times[tracking_id] = video_timestamp

            # Loitering Check
            if dwell_seconds >= self.loiter_threshold and not state.has_loiter_alerted:
                state.has_loiter_alerted = True
                event_type = "Loitering in restricted zone"
                severity = "Critical" if category == "person" else "Medium"
                should_alert = True
                state.last_alert_time = video_timestamp
            elif not state.in_restricted_zone:
                # State transition: OUTSIDE -> INSIDE (New breach event fired ONCE)
                state.in_restricted_zone = True
                if (video_timestamp - state.last_alert_time) >= self.debounce_seconds:
                    if category == "person":
                        event_type = "Zone breach"
                        severity = "Critical"
                    elif category == "vehicle":
                        event_type = "Vehicle detected"
                        severity = "Medium"
                    else:
                        event_type = "Animal detected"
                        severity = "Low"
                    should_alert = True
                    state.last_alert_time = video_timestamp
        else:
            if state.in_restricted_zone:
                # State transition: INSIDE -> OUTSIDE (Reset condition)
                state.in_restricted_zone = False
                state.zone_cleared_time = video_timestamp

            # 2. Border Fence Proximity & Approach Logic (Zero-tolerance perimeter corridor)
            # In defense-grade surveillance, any person/vehicle detected within 25m of the international border line
            # constitutes a perimeter security event, whether moving or stationary!
            if dist_to_fence <= 25.0:
                if not state.approaching_fence:
                    state.approaching_fence = True
                    if (video_timestamp - state.last_alert_time) >= self.debounce_seconds:
                        if dist_to_fence <= 15.0:
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
                elif dwell_seconds >= self.loiter_threshold and not state.has_loiter_alerted:
                    # Target lingering close to fence
                    state.has_loiter_alerted = True
                    event_type = "Perimeter fence loitering"
                    severity = "Critical" if category == "person" else "Medium"
                    should_alert = True
                    state.last_alert_time = video_timestamp
            else:
                state.approaching_fence = False
                # 3. Sector Intrusion Check (For persons detected anywhere in field of view)
                if category == "person" and dwell_seconds >= 2.0 and not state.has_loiter_alerted:
                    if (video_timestamp - state.last_alert_time) >= self.debounce_seconds * 2:
                        state.has_loiter_alerted = True
                        event_type = "Unidentified person in sector"
                        severity = "Medium"
                        should_alert = True
                        state.last_alert_time = video_timestamp

        return {
            "is_in_restricted_zone": is_inside,
            "distance_to_fence": f"{int(dist_to_fence)} m",
            "should_alert": should_alert,
            "event_type": event_type,
            "severity": severity
        }
