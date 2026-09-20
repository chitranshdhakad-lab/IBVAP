import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AlertRule
from app.services.audit_service import log_audit

router = APIRouter(prefix="/rules", tags=["Alert Rules"])

class RuleCreate(BaseModel):
    rule_type: str
    name: str
    enabled: bool = True
    threshold: float = 0.0
    severity: str = "High"
    cooldown_seconds: int = 15
    parameters: Dict[str, Any] = {}

class RuleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    threshold: Optional[float] = None
    severity: Optional[str] = None
    cooldown_seconds: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None

class RuleOut(BaseModel):
    id: int
    rule_type: str
    name: str
    enabled: bool
    threshold: float
    severity: str
    cooldown_seconds: int
    parameters: Dict[str, Any]
    updated_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True

@router.get("", response_model=List[RuleOut])
def list_rules(db: Session = Depends(get_db)):
    """Fetch all tactical alert rules."""
    rules = db.query(AlertRule).all()
    if not rules:
        # Seed default operational rules if empty
        defaults = [
            AlertRule(
                rule_type="ZONE_BREACH",
                name="Restricted Zone Breach",
                enabled=True,
                threshold=0.0,
                severity="Critical",
                cooldown_seconds=5,
                parameters={"target_types": ["person", "vehicle"]}
            ),
            AlertRule(
                rule_type="LOITERING",
                name="Loitering Detection",
                enabled=True,
                threshold=4.0, # 4 seconds dwell
                severity="Medium",
                cooldown_seconds=15,
                parameters={"dwell_seconds": 4.0}
            ),
            AlertRule(
                rule_type="FENCE_APPROACH",
                name="Movement Towards Border Fence",
                enabled=True,
                threshold=15.0, # 15 meters
                severity="High",
                cooldown_seconds=10,
                parameters={"proximity_meters": 15.0}
            ),
            AlertRule(
                rule_type="SEVERITY_MAPPING",
                name="Severity Risk Engine Calibration",
                enabled=True,
                threshold=75.0, # High risk cutoff
                severity="Critical",
                cooldown_seconds=0,
                parameters={"risk_weights": {"zone": 40, "fence": 35, "loiter": 25}}
            )
        ]
        db.add_all(defaults)
        db.commit()
        rules = db.query(AlertRule).all()
    return rules

@router.patch("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, update_data: RuleUpdate, db: Session = Depends(get_db)):
    """Update rule parameters and trigger thresholds."""
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if update_data.name is not None:
        rule.name = update_data.name
    if update_data.enabled is not None:
        rule.enabled = update_data.enabled
    if update_data.threshold is not None:
        rule.threshold = update_data.threshold
    if update_data.severity is not None:
        rule.severity = update_data.severity
    if update_data.cooldown_seconds is not None:
        rule.cooldown_seconds = update_data.cooldown_seconds
    if update_data.parameters is not None:
        rule.parameters = update_data.parameters

    rule.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(rule)

    log_audit(db, "RULE_UPDATED", "AlertRule", f"Updated rule '{rule.name}' (enabled={rule.enabled}, severity={rule.severity})", entity_id=str(rule.id))
    return rule
