from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
import datetime
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

class AuditLogOut(BaseModel):
    id: int
    timestamp: datetime.datetime
    action: str
    entity: str
    entity_id: Optional[str]
    details: Optional[str]
    user: str

    class Config:
        from_attributes = True

@router.get("", response_model=List[AuditLogOut])
def get_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    action: Optional[str] = None,
    entity: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retrieve immutable audit logs recorded across operational sessions."""
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if entity:
        q = q.filter(AuditLog.entity.ilike(f"%{entity}%"))
    return q.order_by(AuditLog.id.desc()).limit(limit).all()
