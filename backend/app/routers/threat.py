from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import SecurityEvent, Alert
from app.services.job_manager import job_manager

router = APIRouter(prefix="/threat", tags=["Threat"])

@router.get("/current")
def get_current_threat(db: Session = Depends(get_db)):
    """
    Returns the real-time threat assessment synchronized with active job telemetry
    or active, unresolved alerts in the surveillance zone.
    """
    # 1. If an analysis job is currently active, return live telemetry threat score
    if job_manager.status in ["RUNNING", "PROCESSING"]:
        score = job_manager.current_threat_score
        if score >= 75:
            level = "CRITICAL"
            desc = "Imminent boundary threat — Incursion in progress"
        elif score >= 50:
            level = "HIGH RISK"
            desc = "High risk activity — Restricted sector breach or approach"
        elif score >= 25:
            level = "MEDIUM RISK"
            desc = "Elevated surveillance alert — Active target monitoring"
        elif score > 0:
            level = "LOW RISK"
            desc = "Routine monitored activity in buffer sector"
        else:
            level = "SECURE"
            desc = "Perimeter optical feed clear — All sectors nominal"

        return {
            "score": score,
            "level": level,
            "description": desc,
            "key_factors": [
                f"Live video stream active ({job_manager.camera_id})",
                f"Calibrated threat score: {score}/100"
            ] if score > 0 else [
                "Optical sensors calibrated",
                "Perimeter clear"
            ]
        }

    # 2. If idle, check for open, unresolved alerts
    active_alert = db.query(Alert).filter(Alert.status == "ACTIVE").order_by(Alert.id.desc()).first()
    if active_alert and active_alert.event_id:
        sec_evt = db.query(SecurityEvent).filter(SecurityEvent.id == active_alert.event_id).first()
        if sec_evt:
            score = sec_evt.risk_score
            if score >= 75:
                level = "CRITICAL"
            elif score >= 50:
                level = "HIGH RISK"
            elif score >= 25:
                level = "MEDIUM RISK"
            else:
                level = "LOW RISK"

            return {
                "score": score,
                "level": level,
                "description": f"Unresolved incident: {sec_evt.event_type} at {sec_evt.camera_id}",
                "key_factors": sec_evt.key_factors or [
                    f"{sec_evt.object_class.capitalize()} detected",
                    f"Camera: {sec_evt.camera_id}"
                ]
            }

    # 3. All clear - zero state
    return {
        "score": 0,
        "level": "SECURE",
        "description": "Perimeter optical feed clear — All sectors nominal",
        "key_factors": [
            "Perimeter clear",
            "No active incursions",
            "Optical sensors calibrated"
        ]
    }
