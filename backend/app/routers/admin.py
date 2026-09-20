import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import EVIDENCE_DIR, VIDEOS_DIR
from app.models import (
    SystemSetting, SecurityEvent, Alert, Detection,
    Track, AnalysisJob, Video, Camera, Snapshot,
    DetectedPlate, WatchlistPlate
)
from app.routers.settings import DEFAULT_SETTINGS
from app.services.job_manager import job_manager
from app.services.audit_service import log_audit

router = APIRouter(prefix="/admin", tags=["Administration & Maintenance"])

class ResetSettingsRequest(BaseModel):
    confirm: bool

class ResetDataRequest(BaseModel):
    confirmation: str # Must be exactly "RESET IBVAP"
    delete_cameras: bool = False
    delete_videos: bool = False

@router.post("/reset-settings")
def reset_settings_defaults(req: ResetSettingsRequest, db: Session = Depends(get_db)):
    """Resets system settings back to factory calibrated defaults."""
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Confirmation flag required to reset settings")

    for key, val in DEFAULT_SETTINGS.items():
        existing = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if existing:
            existing.value = str(val)
        else:
            db.add(SystemSetting(key=key, value=str(val)))
    db.commit()

    log_audit(db, "RESET_SETTINGS", "SystemSetting", "Reset all operational settings to factory defaults")
    return {"status": "SUCCESS", "message": "Settings restored to factory defaults"}

class ResetAnalysisRequest(BaseModel):
    confirm: bool

@router.post("/reset-analysis-data")
def reset_analysis_data(req: ResetAnalysisRequest, db: Session = Depends(get_db)):
    """
    Purges analysis execution records (detections, tracks, ANPR plates, and analysis jobs)
    and restores video processing states to IDLE.
    Preserves cameras, alert rules, settings, security events, and evidence.
    """
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Confirmation flag required to reset analysis data")

    # 1. Stop any running analysis jobs
    if job_manager.status in ["RUNNING", "PROCESSING"]:
        job_manager.stop_job()
    job_manager.reset()

    # 2. Database purge
    try:
        del_dets = db.query(Detection).delete()
        del_tracks = db.query(Track).delete()
        del_plates = db.query(DetectedPlate).delete()
        del_jobs = db.query(AnalysisJob).delete()

        # Reset video processing statuses to IDLE
        videos = db.query(Video).all()
        for v in videos:
            v.processing_status = "IDLE"
            v.processed_frames = 0

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Reset analysis data failed: {str(e)}")

    log_audit(
        db,
        "RESET_ANALYSIS_DATA",
        "AnalysisJob",
        f"Purged {del_dets} detections, {del_tracks} tracks, {del_plates} plates, {del_jobs} jobs. Videos reset to IDLE."
    )

    return {
        "status": "SUCCESS",
        "message": "Analysis records have been cleared and video states reset to IDLE",
        "purged_detections": del_dets,
        "purged_tracks": del_tracks,
        "purged_plates": del_plates,
        "purged_jobs": del_jobs
    }

@router.post("/reset-data")
def reset_all_data(req: ResetDataRequest, db: Session = Depends(get_db)):
    """
    Destructive purge of operational surveillance data.
    Requires typing 'RESET IBVAP' in the confirmation payload.
    """
    if req.confirmation != "RESET IBVAP":
        raise HTTPException(
            status_code=400,
            detail="Safety verification failed. You must provide exact confirmation text 'RESET IBVAP'."
        )

    # 1. Stop any running analysis jobs
    if job_manager.status in ["RUNNING", "PROCESSING"]:
        job_manager.stop_job()
    job_manager.reset()

    # 2. Database purge in a single atomic transaction
    try:
        db.query(Detection).delete()
        db.query(Track).delete()
        db.query(Alert).delete()
        db.query(SecurityEvent).delete()
        db.query(Snapshot).delete()
        db.query(AnalysisJob).delete()
        db.query(DetectedPlate).delete()
        db.query(WatchlistPlate).delete()

        if req.delete_videos:
            db.query(Video).delete()

        if req.delete_cameras:
            db.query(Camera).delete()

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database reset transaction failed: {str(e)}")

    # 3. Clean physical evidence snapshot files (preserves videos unless requested)
    cleaned_snapshots = 0
    if EVIDENCE_DIR.exists():
        for f in EVIDENCE_DIR.glob("*.*"):
            try:
                if f.is_file():
                    f.unlink()
                    cleaned_snapshots += 1
            except Exception:
                pass

    log_audit(
        db,
        "RESET_ALL_DATA",
        "Database",
        f"Destructive reset completed. Cleaned {cleaned_snapshots} snapshot files. Camera purge: {req.delete_cameras}"
    )

    return {
        "status": "SUCCESS",
        "message": "Operational surveillance data has been completely reset",
        "cleaned_snapshots": cleaned_snapshots,
        "cameras_retained": not req.delete_cameras
    }
