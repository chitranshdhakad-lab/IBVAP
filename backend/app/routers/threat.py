from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import SecurityEvent

router = APIRouter(prefix="/threat", tags=["Threat"])

@router.get("/current")
def get_current_threat(db: Session = Depends(get_db)):
    """Returns the latest threat assessment calculated from real event data."""
    latest_event = db.query(SecurityEvent).order_by(SecurityEvent.id.desc()).first()
    if latest_event:
        score = latest_event.risk_score
        if score >= 70:
            level = "HIGH RISK"
        elif score >= 40:
            level = "ELEVATED RISK"
        else:
            level = "LOW RISK"
        return {
            "score": score,
            "level": level,
            "description": f"Incident recorded: {latest_event.event_type} at {latest_event.camera_id}",
            "key_factors": latest_event.key_factors or [
                f"{latest_event.object_class.capitalize()} detected",
                f"Camera: {latest_event.camera_id}"
            ]
        }

    return {
        "score": 0,
        "level": "SECURE",
        "description": "Sector perimeter secure. No boundary breaches detected.",
        "key_factors": [
            "Perimeter optical scan active",
            "Restricted zones clear"
        ]
    }
