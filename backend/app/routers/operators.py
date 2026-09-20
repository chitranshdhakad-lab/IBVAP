import os
import hashlib
import secrets
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Operator, AuditLog
from app.services.audit_service import log_audit

router = APIRouter(prefix="/operators", tags=["Operator & Personnel Management"])

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    salted = f"{salt}:{password}".encode("utf-8")
    hashed = hashlib.sha256(salted).hexdigest()
    return hashed, salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    expected_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(expected_hash, hashed)

# Pydantic Schemas
class CreateOperatorRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=4, max_length=128)
    full_name: Optional[str] = "Tactical Operator"
    role: Optional[str] = "Tactical Operator"
    bop_sector: Optional[str] = "BOP Sector Alpha"
    callsign: Optional[str] = "EAGLE-01"
    badge_number: Optional[str] = "BSF-9942"
    security_pin: Optional[str] = "1234"

class LoginRequest(BaseModel):
    username: str
    password: str

class UpdateOperatorRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    bop_sector: Optional[str] = None
    callsign: Optional[str] = None
    badge_number: Optional[str] = None
    security_pin: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("")
def list_operators(db: Session = Depends(get_db)):
    """Returns a list of all registered border surveillance operators."""
    operators = db.query(Operator).order_by(Operator.id.asc()).all()
    return [op.to_dict() for op in operators]

@router.post("", status_code=status.HTTP_201_CREATED)
def create_operator(req: CreateOperatorRequest, db: Session = Depends(get_db)):
    """
    Creates a new border surveillance operator account with username, password,
    tactical callsign, assigned BOP sector, and clearance role.
    """
    clean_username = req.username.strip().lower()
    if not clean_username:
        raise HTTPException(status_code=400, detail="Username cannot be blank")

    # Check for existing username
    existing = db.query(Operator).filter(Operator.username == clean_username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Operator username '{clean_username}' is already registered in the boundary roster."
        )

    pwd_hash, salt = hash_password(req.password)

    new_op = Operator(
        username=clean_username,
        password_hash=pwd_hash,
        salt=salt,
        full_name=req.full_name or "Tactical Operator",
        role=req.role or "Tactical Operator",
        bop_sector=req.bop_sector or "BOP Sector Alpha",
        callsign=req.callsign or "EAGLE-01",
        badge_number=req.badge_number or "BSF-9942",
        security_pin=req.security_pin or "1234",
        is_active=True,
        created_at=datetime.datetime.utcnow()
    )

    db.add(new_op)
    db.commit()
    db.refresh(new_op)

    log_audit(
        db,
        action="OPERATOR_ACCOUNT_CREATED",
        entity="Operator",
        details=f"Created account for {new_op.full_name} ({new_op.username}) - {new_op.role} at {new_op.bop_sector}",
        user="Command Admin"
    )

    return {
        "status": "SUCCESS",
        "message": f"Operator account '{new_op.username}' created successfully.",
        "operator": new_op.to_dict()
    }

@router.post("/login")
def login_operator(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticates an operator with username and password."""
    clean_username = req.username.strip().lower()
    op = db.query(Operator).filter(Operator.username == clean_username).first()

    if not op or not verify_password(req.password, op.password_hash, op.salt):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid operator credentials. Access denied."
        )

    if not op.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This operator account has been deactivated by border command."
        )

    op.last_login = datetime.datetime.utcnow()
    db.commit()

    log_audit(
        db,
        action="OPERATOR_LOGIN",
        entity="Operator",
        details=f"Operator {op.username} ({op.callsign}) authenticated successfully.",
        user=op.username
    )

    return {
        "status": "AUTHENTICATED",
        "operator": op.to_dict(),
        "token": f"ibvap-session-{secrets.token_hex(12)}"
    }

@router.get("/{operator_id}")
def get_operator(operator_id: int, db: Session = Depends(get_db)):
    op = db.query(Operator).filter(Operator.id == operator_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    return op.to_dict()

@router.put("/{operator_id}")
def update_operator(operator_id: int, req: UpdateOperatorRequest, db: Session = Depends(get_db)):
    op = db.query(Operator).filter(Operator.id == operator_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")

    if req.full_name is not None:
        op.full_name = req.full_name
    if req.role is not None:
        op.role = req.role
    if req.bop_sector is not None:
        op.bop_sector = req.bop_sector
    if req.callsign is not None:
        op.callsign = req.callsign
    if req.badge_number is not None:
        op.badge_number = req.badge_number
    if req.security_pin is not None:
        op.security_pin = req.security_pin
    if req.is_active is not None:
        op.is_active = req.is_active
    if req.password:
        pwd_hash, salt = hash_password(req.password)
        op.password_hash = pwd_hash
        op.salt = salt

    db.commit()
    db.refresh(op)

    log_audit(
        db,
        action="OPERATOR_UPDATED",
        entity="Operator",
        details=f"Updated details for operator {op.username}",
        user="Admin"
    )

    return {
        "status": "SUCCESS",
        "message": "Operator details updated successfully",
        "operator": op.to_dict()
    }

@router.delete("/{operator_id}")
def delete_operator(operator_id: int, db: Session = Depends(get_db)):
    op = db.query(Operator).filter(Operator.id == operator_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")

    # Guard against deleting the last remaining operator
    count = db.query(Operator).count()
    if count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the primary operator account. At least one active account must exist."
        )

    username = op.username
    db.delete(op)
    db.commit()

    log_audit(
        db,
        action="OPERATOR_DELETED",
        entity="Operator",
        details=f"Deleted operator {username}",
        user="Admin"
    )

    return {
        "status": "SUCCESS",
        "message": f"Operator '{username}' deleted successfully"
    }
