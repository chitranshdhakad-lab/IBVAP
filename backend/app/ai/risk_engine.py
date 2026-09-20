from typing import List, Dict, Any

class ThreatRiskEngine:
    """
    Threat Assessment & Composite Risk Score Engine.
    Produces calibrated risk score (0-100), threat classification, and key contributing factors.
    """
    def __init__(self):
        pass

    def compute_threat(
        self,
        active_entities: List[Dict[str, Any]],
        any_zone_breach: bool = False,
        is_night: bool = True
    ) -> Dict[str, Any]:
        if not active_entities and not any_zone_breach:
            return {
                "score": 0,
                "level": "SECURE",
                "description": "Perimeter optical feed clear — All sectors nominal",
                "key_factors": ["Perimeter clear", "No active incursions", "Optical sensors calibrated"]
            }

        score = 10
        key_factors = []

        has_person = any(e.get("category") == "person" or e.get("class") == "person" for e in active_entities)
        has_vehicle = any(e.get("category") == "vehicle" or e.get("class") == "car" or e.get("class") == "truck" for e in active_entities)
        has_animal = any(e.get("category") == "animal" or e.get("class") == "dog" for e in active_entities)

        moving_to_boundary = any(
            "towards" in str(e.get("direction", "")).lower() or
            "fence" in str(e.get("direction", "")).lower() or
            "border" in str(e.get("direction", "")).lower()
            for e in active_entities
        )

        def get_dwell_seconds(e):
            raw = str(e.get("dwell_time", "0")).lower().replace("sec", "").replace("s", "").strip()
            try:
                return float(raw.split()[0])
            except (ValueError, IndexError):
                return 0.0

        high_dwell = any(get_dwell_seconds(e) > 30.0 for e in active_entities)
        is_breaching = any(e.get("is_breaching") or e.get("is_in_restricted_zone") for e in active_entities) or any_zone_breach

        if is_breaching:
            score += 35
            key_factors.append("Restricted zone breach active")

        if has_person:
            score += 25
            key_factors.append("Person detected in surveillance grid")

        if has_vehicle:
            score += 20
            key_factors.append("Vehicle detected near perimeter")

        if moving_to_boundary:
            score += 20
            key_factors.append("Suspicious vector towards boundary fence")

        if high_dwell:
            score += 15
            key_factors.append("Loitering dwell threshold exceeded (>30s)")

        if is_night:
            score += 10
            key_factors.append("Low-visibility night operation")

        if len(active_entities) >= 3:
            score += 15
            key_factors.append("Multiple target cluster detected")

        score = max(0, min(100, score))

        # Classify level with military defense standard
        if score >= 75:
            level = "CRITICAL"
            desc = "Imminent boundary threat — Active incursion in progress"
        elif score >= 50:
            level = "HIGH RISK"
            desc = "Suspicious movement approaching restricted sector"
        elif score >= 25:
            level = "MEDIUM RISK"
            desc = "Monitored target activity in buffer sector"
        else:
            level = "SECURE"
            desc = "Routine perimeter status nominal"

        return {
            "score": score,
            "level": level,
            "description": desc,
            "key_factors": key_factors if key_factors else ["Sector scanning active"]
        }

