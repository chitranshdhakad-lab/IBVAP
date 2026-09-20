from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Video, SecurityEvent, Camera, Track, DetectedPlate

router = APIRouter(prefix="/search", tags=["Global Search"])

@router.get("")
def global_search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Performs global search across registered videos, cameras, security events, ANPR plates, and tracked entities.
    """
    query_str = f"%{q.strip()}%"

    # Search cameras
    cams = db.query(Camera).filter(
        (Camera.id.ilike(query_str)) |
        (Camera.name.ilike(query_str)) |
        (Camera.sector.ilike(query_str)) |
        (Camera.location.ilike(query_str))
    ).limit(5).all()

    # Search videos
    vids = db.query(Video).filter(
        (Video.filename.ilike(query_str)) |
        (Video.camera_id.ilike(query_str))
    ).limit(5).all()

    # Search security events
    evts = db.query(SecurityEvent).filter(
        (SecurityEvent.event_type.ilike(query_str)) |
        (SecurityEvent.object_class.ilike(query_str)) |
        (SecurityEvent.camera_id.ilike(query_str)) |
        (SecurityEvent.severity.ilike(query_str))
    ).order_by(SecurityEvent.id.desc()).limit(8).all()

    # Search tracks
    tracks = db.query(Track).filter(
        (Track.object_class.ilike(query_str)) |
        (Track.camera_id.ilike(query_str))
    ).limit(5).all()

    # Search detected plates
    clean_plate_query = q.strip().replace(" ", "").upper()
    plates = db.query(DetectedPlate).filter(
        (DetectedPlate.plate_number.ilike(f"%{clean_plate_query}%")) |
        (DetectedPlate.state_name.ilike(query_str)) |
        (DetectedPlate.vehicle_type.ilike(query_str))
    ).order_by(DetectedPlate.id.desc()).limit(5).all()

    return {
        "query": q,
        "results": {
            "cameras": [
                {"id": c.id, "name": c.name, "sector": c.sector, "status": c.status}
                for c in cams
            ],
            "videos": [
                {"id": v.id, "filename": v.filename, "camera_id": v.camera_id, "duration": v.duration}
                for v in vids
            ],
            "events": [
                {
                    "id": e.id,
                    "event_type": e.event_type,
                    "camera_id": e.camera_id,
                    "time": e.timestamp,
                    "severity": e.severity,
                    "track_id": e.tracking_id
                }
                for e in evts
            ],
            "plates": [
                {
                    "id": p.id,
                    "plate_number": p.plate_number,
                    "vehicle_type": p.vehicle_type,
                    "camera_id": p.camera_id,
                    "status": p.status
                }
                for p in plates
            ],
            "tracks": [
                {
                    "id": t.id,
                    "track_id": t.track_id,
                    "object_class": t.object_class,
                    "camera_id": t.camera_id
                }
                for t in tracks
            ]
        },
        "total_matches": len(cams) + len(vids) + len(evts) + len(tracks) + len(plates)
    }
