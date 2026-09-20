import datetime
import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models import AuditLog

logger = logging.getLogger("surveillance.audit")

def log_audit(
    db: Session,
    action: str,
    entity: str,
    details: str,
    user: str = "Operator",
    entity_id: Optional[str] = None
) -> Optional[AuditLog]:
    """
    Records an immutable audit log entry in the SQLite database.
    """
    try:
        entry = AuditLog(
            timestamp=datetime.datetime.utcnow(),
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            details=details,
            user=user
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        logger.info(f"[AUDIT] [{user}] {action} on {entity}:{entity_id or ''} - {details}")
        return entry
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        db.rollback()
        return None
