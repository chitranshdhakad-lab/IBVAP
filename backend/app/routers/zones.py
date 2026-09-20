import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RestrictedZone, Camera
from app.services.audit_service import log_audit

router = APIRouter(prefix="/zones", tags=["Restricted Zones"])

class ZoneCreate(BaseModel):
    camera_id: str
    name: str
    polygon_coords: List[List[float]]
    enabled: bool = True
    description: Optional[str] = None

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    polygon_coords: Optional[List[List[float]]] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None

class ZoneOut(BaseModel):
    id: int
    camera_id: str
    name: str
    polygon_coords: List[List[float]]
    enabled: bool
    description: Optional[str]
    created_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True

@router.get("", response_model=List[ZoneOut])
def get_zones(camera_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Fetch all restricted polygon zones or filter by camera."""
    q = db.query(RestrictedZone)
    if camera_id:
        q = q.filter(RestrictedZone.camera_id == camera_id)
    return q.all()

@router.post("", response_model=ZoneOut)
def create_zone(zone_in: ZoneCreate, db: Session = Depends(get_db)):
    """Create a new restricted tactical perimeter zone."""
    cam = db.query(Camera).filter(Camera.id == zone_in.camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera station {zone_in.camera_id} not found")

    zone = RestrictedZone(
        camera_id=zone_in.camera_id,
        name=zone_in.name,
        polygon_coords=zone_in.polygon_coords,
        enabled=zone_in.enabled,
        description=zone_in.description,
        created_at=datetime.datetime.utcnow()
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)

    # Sync camera's active restricted zone if it's the primary one
    cam.restricted_zone = zone.polygon_coords
    db.commit()

    log_audit(db, "ZONE_CREATED", "RestrictedZone", f"Created zone '{zone.name}' for {cam.id}", entity_id=str(zone.id))
    return zone

@router.patch("/{zone_id}", response_model=ZoneOut)
def update_zone(zone_id: int, update_data: ZoneUpdate, db: Session = Depends(get_db)):
    """Update an existing tactical zone."""
    zone = db.query(RestrictedZone).filter(RestrictedZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if update_data.name is not None:
        zone.name = update_data.name
    if update_data.polygon_coords is not None:
        zone.polygon_coords = update_data.polygon_coords
    if update_data.enabled is not None:
        zone.enabled = update_data.enabled
    if update_data.description is not None:
        zone.description = update_data.description

    db.commit()
    db.refresh(zone)

    # Sync camera restricted zone if enabled
    cam = db.query(Camera).filter(Camera.id == zone.camera_id).first()
    if cam:
        cam.restricted_zone = zone.polygon_coords if zone.enabled else None
        db.commit()

    log_audit(db, "ZONE_UPDATED", "RestrictedZone", f"Updated zone '{zone.name}'", entity_id=str(zone.id))
    return zone

@router.delete("/{zone_id}")
def delete_zone(zone_id: int, db: Session = Depends(get_db)):
    """Delete a restricted zone."""
    zone = db.query(RestrictedZone).filter(RestrictedZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    cam = db.query(Camera).filter(Camera.id == zone.camera_id).first()
    if cam and cam.restricted_zone == zone.polygon_coords:
        cam.restricted_zone = None

    db.delete(zone)
    db.commit()

    log_audit(db, "ZONE_DELETED", "RestrictedZone", f"Deleted zone ID {zone_id}", entity_id=str(zone_id))
    return {"status": "SUCCESS", "message": f"Zone {zone_id} deleted"}
