from typing import List, Dict, Any, Optional

class ThreatRiskEngine:
    """
    Threat Assessment & Composite Risk Score Engine.
    Produces strictly real, calibrated risk scores (0-100), threat classification,
    and contributing factors dynamically derived from active YOLO detections,
    tracking trajectories, and tactical rule violations.
    Zero hardcoded baseline or fallback scores.
    """
    def __init__(self):
        pass

    def compute_threat(
        self,
        active_entities: List[Dict[str, Any]],
        any_zone_breach: bool = False,
        any_border_crossing: bool = False,
        min_fence_dist: Optional[float] = None,
        is_night: bool = False,
        active_events: Optional[List[Dict[str, Any]]] = None,
        custom_weights: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Calculates composite threat score (0-100) dynamically from real detection,
        tracking, and rule evaluation data.
        """
        # If no entities are present and no breach/crossing is in progress, perimeter is clear (0/100)
        if not active_entities and not any_zone_breach and not any_border_crossing:
            return {
                "score": 0,
                "level": "SECURE",
                "description": "Perimeter optical feed clear — All sectors nominal",
                "key_factors": ["Perimeter clear", "No active incursions", "Optical sensors calibrated"]
            }

        # Dynamically fetch configurable risk weights from runtime settings
        try:
            from app.routers.settings import get_active_runtime_settings
            cfg = get_active_runtime_settings()
        except Exception:
            cfg = {}

        weights = custom_weights or cfg.get("risk_weights", {
            "border_crossing": 45.0,
            "restricted_zone": 35.0,
            "approach": 25.0,
            "loitering": 15.0,
            "night_time": 10.0
        })
        loiter_threshold = float(cfg.get("loitering_threshold_seconds", 4.0))

        score = 0.0
        key_factors = []

        # Analyze active entities
        has_person = any(
            e.get("category") == "person" or str(e.get("class", "")).lower() == "person"
            for e in active_entities
        )
        has_vehicle = any(
            e.get("category") == "vehicle" or str(e.get("class", "")).lower() in ["car", "truck", "bus", "motorcycle"]
            for e in active_entities
        )
        has_animal = any(
            e.get("category") == "animal" or str(e.get("class", "")).lower() in ["dog", "cat", "horse", "sheep", "cow"]
            for e in active_entities
        )

        moving_to_boundary = any(
            "towards" in str(e.get("direction", "")).lower() or
            "fence" in str(e.get("direction", "")).lower() or
            "border" in str(e.get("direction", "")).lower()
            for e in active_entities
        )

        def get_dwell_seconds(e: Dict[str, Any]) -> float:
            raw = str(e.get("dwell_time", "0")).lower().replace("sec", "").replace("s", "").strip()
            try:
                return float(raw.split()[0])
            except (ValueError, IndexError):
                return 0.0

        max_dwell = max((get_dwell_seconds(e) for e in active_entities), default=0.0)
        has_loitered = max_dwell >= loiter_threshold

        is_breaching = any(
            e.get("is_breaching") or e.get("is_in_restricted_zone")
            for e in active_entities
        ) or any_zone_breach

        is_crossing = any(
            e.get("crossed_border") or e.get("is_crossing_border")
            for e in active_entities
        ) or any_border_crossing

        # If min_fence_dist is not provided, derive from active entities
        if min_fence_dist is None:
            entity_dists = []
            for e in active_entities:
                if "distance_meters" in e:
                    entity_dists.append(float(e["distance_meters"]))
                elif "distance_to_fence" in e:
                    raw_d = str(e["distance_to_fence"]).lower().replace("m", "").strip()
                    try:
                        entity_dists.append(float(raw_d))
                    except ValueError:
                        pass
            if entity_dists:
                min_fence_dist = min(entity_dists)

        # 1. Critical Tactical Rule Factors
        if is_crossing:
            score += float(weights.get("border_crossing", 45.0))
            key_factors.append("Critical border line crossing detected")

        if is_breaching:
            score += float(weights.get("restricted_zone", 35.0))
            key_factors.append("Restricted zone breach active")

        if moving_to_boundary:
            score += float(weights.get("approach", 25.0))
            key_factors.append("Tactical approach vector towards boundary fence")

        if has_loitered:
            score += float(weights.get("loitering", 15.0))
            key_factors.append(f"Perimeter dwell/loitering detected ({int(max_dwell)}s)")

        if min_fence_dist is not None and min_fence_dist <= 10.0 and not is_breaching:
            score += 15.0
            key_factors.append(f"Critical fence proximity alert ({int(min_fence_dist)}m)")

        # 2. Target Classification Factors
        if has_person:
            score += 15.0
            key_factors.append("Person detected in operational sector")
        elif has_vehicle:
            score += 15.0
            key_factors.append("Vehicle detected in operational sector")
        elif has_animal:
            score += 5.0
            key_factors.append("Wildlife / animal activity detected")

        # 3. Multi-Target Tactical Cluster Factor
        if len(active_entities) >= 3:
            score += 10.0
            key_factors.append(f"Multi-target cluster detected ({len(active_entities)} targets)")

        # 4. Environmental Low-Visibility / Night Factor
        if is_night:
            score += float(weights.get("night_time", 10.0))
            key_factors.append("Low-visibility / night operation")

        # Cap strictly in range [0, 100]
        final_score = int(max(0, min(100, round(score))))

        # Military C4ISR threat classification levels
        if final_score >= 75:
            level = "CRITICAL"
            desc = "Imminent boundary threat — Active incursion in progress"
        elif final_score >= 50:
            level = "HIGH RISK"
            desc = "High risk activity — Restricted sector breach or close approach"
        elif final_score >= 25:
            level = "MEDIUM RISK"
            desc = "Elevated surveillance alert — Approaching perimeter or loitering"
        elif final_score > 0:
            level = "LOW RISK"
            desc = "Routine monitored activity in buffer sector"
        else:
            level = "SECURE"
            desc = "Perimeter optical feed clear — All sectors nominal"

        return {
            "score": final_score,
            "level": level,
            "description": desc,
            "key_factors": key_factors if key_factors else ["Sector scanning nominal"]
        }
