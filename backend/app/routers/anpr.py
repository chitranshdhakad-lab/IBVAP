import io
import csv
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.models import DetectedPlate, WatchlistPlate, SecurityEvent, Alert
from app.services.audit_service import log_audit
from app.ai.anpr_engine import get_anpr_engine, INDIAN_STATE_CODES

router = APIRouter(prefix="/anpr", tags=["Automatic Number Plate Recognition (ANPR)"])

# Pydantic Schemas
class CreateWatchlistRequest(BaseModel):
    plate_number: str = Field(..., min_length=4, max_length=32)
    category: str = "SUSPECT" # "STOLEN", "SUSPECT_SMUGGLING", "UNAUTHORIZED_CROSSING", "ARMY_OFFICIAL", "VIP_WHITELIST"
    severity: str = "High" # "Critical", "High", "Medium", "Info"
    description: Optional[str] = None
    owner_info: Optional[str] = None
    vehicle_model: Optional[str] = None
    added_by: Optional[str] = "Border Security Command"

class UpdatePlateStatusRequest(BaseModel):
    status: str
    notes: Optional[str] = None
    verified: Optional[bool] = None

@router.get("/plates")
def get_detected_plates(
    search: Optional[str] = None,
    camera_id: Optional[str] = None,
    state_code: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Returns detected vehicle license plates with search and filtering.
    """
    query = db.query(DetectedPlate)

    if search:
        s = search.strip().replace(" ", "").upper()
        query = query.filter(
            (func.replace(DetectedPlate.plate_number, " ", "").ilike(f"%{s}%")) |
            (DetectedPlate.state_name.ilike(f"%{search}%")) |
            (DetectedPlate.vehicle_type.ilike(f"%{search}%"))
        )

    if camera_id and camera_id != "ALL":
        query = query.filter(DetectedPlate.camera_id == camera_id)

    if state_code and state_code != "ALL":
        query = query.filter(DetectedPlate.state_code == state_code.upper())

    if status and status != "ALL":
        if status == "SUSPECT":
            query = query.filter(DetectedPlate.status.like("FLAGGED_%"))
        else:
            query = query.filter(DetectedPlate.status == status)

    total = query.count()
    records = query.order_by(desc(DetectedPlate.created_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "plates": [p.to_dict() for p in records]
    }

@router.get("/plates/{plate_id}")
def get_single_plate(plate_id: int, db: Session = Depends(get_db)):
    plate = db.query(DetectedPlate).filter(DetectedPlate.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Detected plate record not found")
    return plate.to_dict()

@router.patch("/plates/{plate_id}")
def update_plate_status(plate_id: int, req: UpdatePlateStatusRequest, db: Session = Depends(get_db)):
    plate = db.query(DetectedPlate).filter(DetectedPlate.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Detected plate record not found")

    if req.status is not None:
        plate.status = req.status
    if req.notes is not None:
        plate.notes = req.notes
    if req.verified is not None:
        plate.verified = req.verified

    db.commit()
    db.refresh(plate)
    return {"status": "SUCCESS", "plate": plate.to_dict()}

@router.delete("/plates/{plate_id}")
def delete_detected_plate(plate_id: int, db: Session = Depends(get_db)):
    plate = db.query(DetectedPlate).filter(DetectedPlate.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Detected plate record not found")

    num = plate.plate_number
    db.delete(plate)
    db.commit()

    log_audit(db, action="ANPR_PLATE_DELETED", entity="DetectedPlate", details=f"Deleted record for plate {num}", user="Operator")
    return {"status": "SUCCESS", "message": f"Plate record #{plate_id} deleted."}

# --- Watchlist / Hotlist Endpoints ---
@router.get("/watchlist")
def get_watchlist(db: Session = Depends(get_db)):
    """Returns all active suspect/stolen vehicle watchlist entries."""
    records = db.query(WatchlistPlate).order_by(desc(WatchlistPlate.created_at)).all()
    return [w.to_dict() for w in records]

@router.post("/watchlist", status_code=status.HTTP_201_CREATED)
def add_to_watchlist(req: CreateWatchlistRequest, db: Session = Depends(get_db)):
    """Adds a vehicle plate number to the border surveillance hotlist."""
    norm_plate = req.plate_number.strip().upper()
    existing = db.query(WatchlistPlate).filter(WatchlistPlate.plate_number == norm_plate).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Plate '{norm_plate}' is already listed on the active watchlist.")

    w = WatchlistPlate(
        plate_number=norm_plate,
        category=req.category,
        severity=req.severity,
        description=req.description or "Flagged suspect vehicle",
        owner_info=req.owner_info,
        vehicle_model=req.vehicle_model,
        added_by=req.added_by or "Border Security Command",
        is_active=True,
        created_at=datetime.datetime.utcnow()
    )
    db.add(w)
    db.commit()
    db.refresh(w)

    log_audit(db, action="ANPR_WATCHLIST_ADDED", entity="WatchlistPlate", details=f"Added plate {norm_plate} ({req.category})", user=req.added_by or "Command")
    return {"status": "SUCCESS", "message": f"Plate '{norm_plate}' added to watchlist", "watchlist_item": w.to_dict()}

@router.delete("/watchlist/{watchlist_id}")
def remove_from_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    w = db.query(WatchlistPlate).filter(WatchlistPlate.id == watchlist_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")

    plate = w.plate_number
    db.delete(w)
    db.commit()

    log_audit(db, action="ANPR_WATCHLIST_REMOVED", entity="WatchlistPlate", details=f"Removed plate {plate} from watchlist", user="Operator")
    return {"status": "SUCCESS", "message": f"Plate '{plate}' removed from watchlist"}

# --- Aggregate Telemetry & Statistics ---
@router.get("/stats")
def get_anpr_stats(db: Session = Depends(get_db)):
    """Aggregates real-time ANPR scan metrics, suspect alert rate, and state breakdowns."""
    now = datetime.datetime.utcnow()
    today_start = datetime.datetime(now.year, now.month, now.day)

    total_scans = db.query(DetectedPlate).count()
    scans_today = db.query(DetectedPlate).filter(DetectedPlate.created_at >= today_start).count()
    suspect_hits = db.query(DetectedPlate).filter(DetectedPlate.status.like("FLAGGED_%")).count()
    watchlist_count = db.query(WatchlistPlate).filter(WatchlistPlate.is_active == True).count()

    # Breakdown by State
    state_rows = db.query(
        DetectedPlate.state_code,
        func.count(DetectedPlate.id)
    ).filter(DetectedPlate.state_code != None).group_by(DetectedPlate.state_code).order_by(desc(func.count(DetectedPlate.id))).limit(8).all()

    state_dist = []
    for code, count in state_rows:
        state_dist.append({
            "code": code,
            "name": INDIAN_STATE_CODES.get(code, code),
            "count": count
        })

    # Breakdown by Vehicle Type
    veh_rows = db.query(
        DetectedPlate.vehicle_type,
        func.count(DetectedPlate.id)
    ).group_by(DetectedPlate.vehicle_type).all()

    veh_dist = [{"type": t or "Vehicle", "count": c} for t, c in veh_rows]

    # Calculate average confidence
    avg_conf_row = db.query(func.avg(DetectedPlate.confidence)).scalar()
    avg_accuracy = round(float(avg_conf_row) * 100, 1) if avg_conf_row else 0.0

    return {
        "total_scans": total_scans,
        "scans_today": scans_today,
        "suspect_hits": suspect_hits,
        "active_watchlist_count": watchlist_count,
        "recognition_accuracy": f"{avg_accuracy}%" if total_scans > 0 else "0.0%",
        "state_distribution": state_dist,
        "vehicle_distribution": veh_dist,
        "system_status": "ACTIVE_RECOGNITION"
    }

# --- CSV Export Endpoint ---
@router.get("/export")
def export_anpr_csv(
    status: Optional[str] = None,
    camera_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(DetectedPlate)
    if status and status != "ALL":
        query = query.filter(DetectedPlate.status == status)
    if camera_id and camera_id != "ALL":
        query = query.filter(DetectedPlate.camera_id == camera_id)

    plates = query.order_by(desc(DetectedPlate.created_at)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Plate Number", "State", "Vehicle Type", "Camera Station",
        "Detection Time", "Status", "Flag Reason", "Direction", "Speed", "Confidence"
    ])

    for p in plates:
        writer.writerow([
            p.id,
            p.plate_number,
            f"{p.state_code} ({p.state_name})" if p.state_code else "N/A",
            p.vehicle_type,
            p.camera_id,
            p.created_at.strftime("%Y-%m-%d %H:%M:%S") if p.created_at else "N/A",
            p.status,
            p.flag_reason or "N/A",
            p.direction,
            p.speed_estimate,
            f"{int(p.confidence * 100)}%" if p.confidence else "N/A"
        ])

    csv_data = output.getvalue()
    filename = f"IBVAP_ANPR_Logs_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
