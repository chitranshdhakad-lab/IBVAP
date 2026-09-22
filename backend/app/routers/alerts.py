import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Alert, SecurityEvent
from app.services.audit_service import log_audit
from app.schemas import AlertOut

router = APIRouter(prefix="/alerts", tags=["Alerts"])

@router.get("", response_model=List[AlertOut])
def list_alerts(db: Session = Depends(get_db)):
    alerts = db.query(Alert).order_by(Alert.id.desc()).limit(50).all()
    return alerts

@router.post("/{alert_id}/verify")
def verify_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    now = datetime.datetime.utcnow()
    alert.status = "VERIFIED"
    alert.verified_by = "Operator"
    alert.verified_at = now

    if alert.event_id:
        evt = db.query(SecurityEvent).filter(SecurityEvent.id == alert.event_id).first()
        if evt:
            evt.verified = True
            evt.verified_by = "Operator"
            evt.verified_at = now

    db.commit()
    log_audit(db, "ALERT_VERIFIED", "Alert", f"Alert #{alert_id} verified by Operator", user="Operator", entity_id=str(alert_id))
    return {"id": alert.id, "status": alert.status, "verified_at": str(alert.verified_at)}

@router.post("/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    now = datetime.datetime.utcnow()
    alert.status = "RESOLVED"
    alert.verified_by = "Operator"
    alert.verified_at = now

    if alert.event_id:
        evt = db.query(SecurityEvent).filter(SecurityEvent.id == alert.event_id).first()
        if evt:
            evt.verified = True
            evt.verified_by = "Operator"
            evt.verified_at = now
            details = dict(evt.details or {})
            details["status"] = "Resolved"
            evt.details = details

    db.commit()
    log_audit(db, "ALERT_RESOLVED", "Alert", f"Alert #{alert_id} resolved by Operator", user="Operator", entity_id=str(alert_id))
    return {"id": alert.id, "status": alert.status, "resolved_at": str(alert.verified_at)}

@router.post("/{alert_id}/escalate")
def escalate_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    alert.status = "ESCALATED"
    alert.severity = "Critical"

    if alert.event_id:
        evt = db.query(SecurityEvent).filter(SecurityEvent.id == alert.event_id).first()
        if evt:
            evt.severity = "Critical"
            details = dict(evt.details or {})
            details["status"] = "Escalated"
            evt.details = details

    db.commit()
    log_audit(db, "ALERT_ESCALATED", "Alert", f"Alert #{alert_id} escalated to Critical by Operator", user="Operator", entity_id=str(alert_id))
    return {"id": alert.id, "status": alert.status, "severity": alert.severity}
