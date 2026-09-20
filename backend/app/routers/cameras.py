import os
import datetime
from pathlib import Path
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Camera
from app.schemas import CameraOut, CameraCreate, CameraUpdate
from app.config import VIDEOS_DIR

router = APIRouter(prefix="/cameras", tags=["Cameras"])

@router.get("", response_model=List[CameraOut])
def get_all_cameras(db: Session = Depends(get_db)):
    """Fetch all configured border camera stations."""
    cams = db.query(Camera).all()
    return cams

@router.get("/{camera_id}", response_model=CameraOut)
def get_camera_by_id(camera_id: str, db: Session = Depends(get_db)):
    """Fetch details for a specific camera station."""
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera station not found")
    return cam

@router.post("", response_model=CameraOut)
def create_camera(cam_in: CameraCreate, db: Session = Depends(get_db)):
    """Create a new camera station."""
    existing = db.query(Camera).filter(Camera.id == cam_in.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Camera with ID {cam_in.id} already exists")
    
    new_cam = Camera(
        id=cam_in.id,
        name=cam_in.name,
        location=cam_in.location,
        sector=cam_in.sector,
        status=cam_in.status or "ACTIVE",
        source_type=cam_in.source_type or "FILE",
        source=cam_in.source or "",
        restricted_zone=cam_in.restricted_zone,
        border_line=cam_in.border_line,
        created_at=datetime.datetime.utcnow(),
        last_seen=datetime.datetime.utcnow() if cam_in.status == "ACTIVE" else None
    )
    db.add(new_cam)
    db.commit()
    db.refresh(new_cam)
    return new_cam

@router.patch("/{camera_id}", response_model=CameraOut)
def update_camera(camera_id: str, update_data: CameraUpdate, db: Session = Depends(get_db)):
    """Update camera configuration."""
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera station not found")
    
    if update_data.name is not None:
        cam.name = update_data.name
    if update_data.location is not None:
        cam.location = update_data.location
    if update_data.sector is not None:
        cam.sector = update_data.sector
    if update_data.status is not None:
        cam.status = update_data.status
    if update_data.source_type is not None:
        cam.source_type = update_data.source_type
    if update_data.source is not None:
        cam.source = update_data.source
    if update_data.restricted_zone is not None:
        cam.restricted_zone = update_data.restricted_zone
    if update_data.border_line is not None:
        cam.border_line = update_data.border_line
        
    db.commit()
    db.refresh(cam)
    return cam

@router.post("/{camera_id}/toggle-status")
def toggle_camera_status(camera_id: str, db: Session = Depends(get_db)):
    """Toggle camera station between ACTIVE and DISABLED."""
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera station not found")
    
    if cam.status == "ACTIVE":
        cam.status = "DISABLED"
    else:
        cam.status = "ACTIVE"
        cam.last_seen = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(cam)
    return {"status": "SUCCESS", "camera_id": cam.id, "new_status": cam.status}

@router.post("/{camera_id}/test-connection")
def test_camera_connection(camera_id: str, db: Session = Depends(get_db)):
    """
    Test genuine connection to camera source (FILE, WEBCAM, or RTSP).
    Returns strictly verified statuses:
    CONNECTED, TIMEOUT, AUTHENTICATION FAILED, INVALID URL, UNREACHABLE, UNSUPPORTED, NOT CONFIGURED
    Never returns CONNECTED without successful frame acquisition.
    """
    import cv2
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera station not found")

    source_type = (cam.source_type or "FILE").upper()
    source = (cam.source or "").strip()

    if source_type == "FILE":
        if not source:
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "NOT CONFIGURED",
                "message": "No video file source configured for this station"
            }

        target = VIDEOS_DIR / source if not Path(source).is_absolute() else Path(source)
        if not target.exists():
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "UNREACHABLE",
                "message": f"Source file does not exist on storage: {target.name}"
            }

        cap = cv2.VideoCapture(str(target))
        if not cap.isOpened():
            cap.release()
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "UNREACHABLE",
                "message": f"OpenCV failed to open video file: {target.name}"
            }

        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None:
            cam.last_seen = datetime.datetime.utcnow()
            cam.status = "ACTIVE"
            db.commit()
            size_mb = round(target.stat().st_size / (1024 * 1024), 1)
            return {
                "success": True,
                "camera_id": cam.id,
                "status": "CONNECTED",
                "message": f"Video source verified: {target.name} ({frame.shape[1]}x{frame.shape[0]}, {size_mb} MB)"
            }
        else:
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "UNREACHABLE",
                "message": f"Corrupted or unreadable frames in video source: {target.name}"
            }

    elif source_type == "WEBCAM":
        try:
            cam_idx = int(source) if source.isdigit() else 0
        except Exception:
            cam_idx = 0

        cap = cv2.VideoCapture(cam_idx)
        if not cap.isOpened():
            cap.release()
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "UNREACHABLE",
                "message": f"No physical webcam device detected at index {cam_idx}"
            }

        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None:
            cam.last_seen = datetime.datetime.utcnow()
            cam.status = "ACTIVE"
            db.commit()
            return {
                "success": True,
                "camera_id": cam.id,
                "status": "CONNECTED",
                "message": f"Webcam device #{cam_idx} verified ({frame.shape[1]}x{frame.shape[0]})"
            }
        else:
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "TIMEOUT",
                "message": f"Webcam device #{cam_idx} timed out waiting for frame"
            }

    elif source_type == "RTSP":
        if not source:
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "NOT CONFIGURED",
                "message": "RTSP stream URL not configured"
            }

        if not source.lower().startswith("rtsp://"):
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "INVALID URL",
                "message": "RTSP URL must begin with rtsp://"
            }

        # Attempt connection to RTSP stream
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            cap.release()
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "UNREACHABLE",
                "message": f"RTSP stream host unreachable or socket closed: {source}"
            }

        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None:
            cam.last_seen = datetime.datetime.utcnow()
            cam.status = "ACTIVE"
            db.commit()
            return {
                "success": True,
                "camera_id": cam.id,
                "status": "CONNECTED",
                "message": f"RTSP live stream feed verified ({frame.shape[1]}x{frame.shape[0]})"
            }
        else:
            cam.status = "OFFLINE"
            db.commit()
            return {
                "success": False,
                "camera_id": cam.id,
                "status": "TIMEOUT",
                "message": f"RTSP stream connected but timed out waiting for keyframe: {source}"
            }

    else:
        return {
            "success": False,
            "camera_id": cam.id,
            "status": "UNSUPPORTED",
            "message": f"Unsupported camera source type: {source_type}"
        }

@router.delete("/{camera_id}")
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    """Safely delete a camera station if not currently in active analysis."""
    from app.routers.analysis import job_manager
    if job_manager.status == "RUNNING" and job_manager.camera_id == camera_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete camera while analysis job is actively running on this station. Stop analysis first."
        )

    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera station not found")

    from app.models import RestrictedZone, Video
    # Clean up dependent zones and unlink camera_id on videos
    db.query(RestrictedZone).filter(RestrictedZone.camera_id == camera_id).delete()
    for vid in db.query(Video).filter(Video.camera_id == camera_id).all():
        vid.camera_id = None

    db.delete(cam)
    db.commit()
    return {"status": "SUCCESS", "message": f"Camera station {camera_id} deleted successfully"}
