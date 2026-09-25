import json
import datetime
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models import SystemSetting, Detection
from app.schemas import SystemSettingsOut, SystemSettingsUpdate
from app.config import settings

logger = logging.getLogger("surveillance.settings")
router = APIRouter(prefix="/settings", tags=["Settings"])

DEFAULT_SETTINGS: Dict[str, Any] = {
    "yolo_confidence_threshold": settings.YOLO_CONFIDENCE_THRESHOLD,
    "processing_fps": 15,
    "model_path": "yolov8n.pt",
    "loitering_threshold_seconds": settings.LOITERING_THRESHOLD_SECONDS,
    "event_cooldown_seconds": settings.DEFAULT_DEBOUNCE_SECONDS,
    "restricted_zone_enabled": True,
    "border_line_enabled": True,
    "virtual_fence_enabled": True,
    "risk_weights": {
        "border_crossing": 45.0,
        "restricted_zone": 35.0,
        "approach": 25.0,
        "loitering": 15.0,
        "night_time": 10.0
    },
    # AI Detection Classes
    "person_detection": True,
    "animal_detection": True,
    "vehicle_detection": True,
    "unknown_object_detection": True,
    "weapon_detection": True,   # From reference project: pistol/rifle/knife detection
    "face_detection": False,    # From reference project: Haar Cascade face detection
    # Alert Toggles
    "intrusion_alerts": True,
    "animal_alerts": True,
    "vehicle_alerts": True,
    "cross_border_alerts": True,
    "weapon_alerts": True,      # From reference project: weapon detection alerts
    "sound_notifications": True,
    "email_notifications": False,
    "sms_notifications": False,
    # Display Settings
    "show_detection_boxes": True,
    "show_confidence_score": True,
    "show_timestamps": True,
    "night_mode_enhancement": False,
    "default_view": "live-monitor",
    "grid_layout": "2x2",
    # Camera Settings
    "default_stream_quality": "1080p",
    "auto_reconnect": True,
    "stream_buffer_seconds": 5,
    "show_camera_status": True,
    # Data & Storage
    "store_detections": True,
    "video_recording": True,
    "retention_period": "30 Days",
    "auto_delete_old_data": True,
    "export_format": "MP4",
    # General Settings
    "system_name": "IBVAP - Border Surveillance System",
    "time_zone": "Asia/Kolkata",
    "language": "en",
    "theme": "light",
    # ANPR (Automatic Number Plate Recognition) Settings
    "anpr_enabled": True,
    "anpr_confidence_threshold": 0.70,
    "anpr_save_plate_crops": True,
    "anpr_auto_flag_watchlist": True,
    "anpr_region_format": "IND_HSRP"
}

ACTIVE_RUNTIME_SETTINGS: Dict[str, Any] = dict(DEFAULT_SETTINGS)

def reload_active_settings():
    global ACTIVE_RUNTIME_SETTINGS
    db = SessionLocal()
    try:
        current = dict(DEFAULT_SETTINGS)
        rows = db.query(SystemSetting).all()
        for row in rows:
            try:
                current[row.key] = json.loads(row.value)
            except Exception:
                pass
        ACTIVE_RUNTIME_SETTINGS = current
    except Exception as e:
        logger.warning(f"Failed to reload runtime settings from DB: {e}")
    finally:
        db.close()

# Initial load on module startup
try:
    reload_active_settings()
except Exception:
    pass

def get_active_runtime_settings() -> Dict[str, Any]:
    return ACTIVE_RUNTIME_SETTINGS

def get_current_settings(db: Session) -> Dict[str, Any]:
    """Retrieves current application settings, merging defaults with DB overrides."""
    current = dict(DEFAULT_SETTINGS)
    rows = db.query(SystemSetting).all()
    for row in rows:
        try:
            val = json.loads(row.value)
            current[row.key] = val
        except Exception:
            pass
    return current

@router.get("", response_model=SystemSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    """Fetch current runtime configuration parameters."""
    cfg = get_current_settings(db)
    return SystemSettingsOut(**cfg)

@router.post("", response_model=SystemSettingsOut)
@router.patch("", response_model=SystemSettingsOut)
def update_settings(updates: SystemSettingsUpdate, db: Session = Depends(get_db)):
    """Update runtime parameters with strict safety validation."""
    global ACTIVE_RUNTIME_SETTINGS
    current = get_current_settings(db)

    # Validation rules
    if updates.yolo_confidence_threshold is not None:
        if not (0.10 <= updates.yolo_confidence_threshold <= 0.95):
            raise HTTPException(
                status_code=422,
                detail="YOLO confidence threshold must be between 0.10 and 0.95"
            )
        current["yolo_confidence_threshold"] = round(updates.yolo_confidence_threshold, 2)
        settings.YOLO_CONFIDENCE_THRESHOLD = current["yolo_confidence_threshold"]

    if updates.processing_fps is not None:
        if not (1 <= updates.processing_fps <= 60):
            raise HTTPException(
                status_code=422,
                detail="Processing FPS must be between 1 and 60"
            )
        current["processing_fps"] = updates.processing_fps

    if updates.model_path is not None:
        clean_model = updates.model_path.strip()
        if not clean_model:
            raise HTTPException(status_code=422, detail="Model path cannot be empty")
        current["model_path"] = clean_model

    if updates.loitering_threshold_seconds is not None:
        if not (1.0 <= updates.loitering_threshold_seconds <= 3600.0):
            raise HTTPException(
                status_code=422,
                detail="Loitering threshold must be between 1.0 and 3600.0 seconds"
            )
        current["loitering_threshold_seconds"] = round(updates.loitering_threshold_seconds, 1)
        settings.LOITERING_THRESHOLD_SECONDS = current["loitering_threshold_seconds"]

    if updates.event_cooldown_seconds is not None:
        if not (0.5 <= updates.event_cooldown_seconds <= 60.0):
            raise HTTPException(
                status_code=422,
                detail="Event cooldown must be between 0.5 and 60.0 seconds"
            )
        current["event_cooldown_seconds"] = round(updates.event_cooldown_seconds, 1)
        settings.DEFAULT_DEBOUNCE_SECONDS = current["event_cooldown_seconds"]

    if updates.restricted_zone_enabled is not None:
        current["restricted_zone_enabled"] = bool(updates.restricted_zone_enabled)

    if updates.border_line_enabled is not None:
        current["border_line_enabled"] = bool(updates.border_line_enabled)
    if updates.virtual_fence_enabled is not None:
        current["virtual_fence_enabled"] = bool(updates.virtual_fence_enabled)

    if updates.risk_weights is not None:
        current["risk_weights"] = updates.risk_weights

    # AI Detection Classes
    if updates.person_detection is not None:
        current["person_detection"] = bool(updates.person_detection)
    if updates.animal_detection is not None:
        current["animal_detection"] = bool(updates.animal_detection)
    if updates.vehicle_detection is not None:
        current["vehicle_detection"] = bool(updates.vehicle_detection)
    if updates.unknown_object_detection is not None:
        current["unknown_object_detection"] = bool(updates.unknown_object_detection)
    if updates.weapon_detection is not None:
        current["weapon_detection"] = bool(updates.weapon_detection)
    if updates.face_detection is not None:
        current["face_detection"] = bool(updates.face_detection)

    # Alert Toggles
    if updates.intrusion_alerts is not None:
        current["intrusion_alerts"] = bool(updates.intrusion_alerts)
        current["restricted_zone_enabled"] = bool(updates.intrusion_alerts)
    if updates.animal_alerts is not None:
        current["animal_alerts"] = bool(updates.animal_alerts)
    if updates.vehicle_alerts is not None:
        current["vehicle_alerts"] = bool(updates.vehicle_alerts)
    if updates.cross_border_alerts is not None:
        current["cross_border_alerts"] = bool(updates.cross_border_alerts)
        current["border_line_enabled"] = bool(updates.cross_border_alerts)
    if updates.weapon_alerts is not None:
        current["weapon_alerts"] = bool(updates.weapon_alerts)
    if updates.sound_notifications is not None:
        current["sound_notifications"] = bool(updates.sound_notifications)
    if updates.email_notifications is not None:
        current["email_notifications"] = bool(updates.email_notifications)
    if updates.sms_notifications is not None:
        current["sms_notifications"] = bool(updates.sms_notifications)

    # Display Settings
    if updates.show_detection_boxes is not None:
        current["show_detection_boxes"] = bool(updates.show_detection_boxes)
    if updates.show_confidence_score is not None:
        current["show_confidence_score"] = bool(updates.show_confidence_score)
    if updates.show_timestamps is not None:
        current["show_timestamps"] = bool(updates.show_timestamps)
    if updates.night_mode_enhancement is not None:
        current["night_mode_enhancement"] = bool(updates.night_mode_enhancement)
    if updates.default_view is not None:
        current["default_view"] = str(updates.default_view)
    if updates.grid_layout is not None:
        current["grid_layout"] = str(updates.grid_layout)

    # Camera Settings
    if updates.default_stream_quality is not None:
        current["default_stream_quality"] = str(updates.default_stream_quality).strip()
    if updates.auto_reconnect is not None:
        current["auto_reconnect"] = bool(updates.auto_reconnect)
    if updates.stream_buffer_seconds is not None:
        current["stream_buffer_seconds"] = max(1, min(30, int(updates.stream_buffer_seconds)))
    if updates.show_camera_status is not None:
        current["show_camera_status"] = bool(updates.show_camera_status)

    # Data & Storage
    if updates.store_detections is not None:
        current["store_detections"] = bool(updates.store_detections)
    if updates.video_recording is not None:
        current["video_recording"] = bool(updates.video_recording)
    if updates.retention_period is not None:
        current["retention_period"] = str(updates.retention_period).strip()
    if updates.auto_delete_old_data is not None:
        current["auto_delete_old_data"] = bool(updates.auto_delete_old_data)
    if updates.export_format is not None:
        current["export_format"] = str(updates.export_format).strip()

    # General Settings
    if updates.system_name is not None:
        current["system_name"] = str(updates.system_name).strip()
    if updates.time_zone is not None:
        current["time_zone"] = str(updates.time_zone).strip()
    if updates.language is not None:
        current["language"] = str(updates.language).strip()
    if updates.theme is not None:
        current["theme"] = str(updates.theme).strip()

    # Persist into system_settings table
    for k, v in current.items():
        db_row = db.query(SystemSetting).filter(SystemSetting.key == k).first()
        serialized = json.dumps(v)
        if db_row:
            db_row.value = serialized
            db_row.updated_at = datetime.datetime.utcnow()
        else:
            db.add(SystemSetting(key=k, value=serialized, updated_at=datetime.datetime.utcnow()))

    db.commit()

    # Update active in-memory dictionary
    ACTIVE_RUNTIME_SETTINGS = current
    logger.info(f"Active runtime settings updated: person_detection={current.get('person_detection')}, animal_detection={current.get('animal_detection')}, vehicle_detection={current.get('vehicle_detection')}, show_boxes={current.get('show_detection_boxes')}")

    return SystemSettingsOut(**current)


@router.post("/purge-storage")
def purge_storage(db: Session = Depends(get_db)):
    """
    Cleans up old detection telemetry records, ANPR plates, alerts, events, and cache entries.
    """
    try:
        from app.models import Track, SecurityEvent, Alert, DetectedPlate, Snapshot, AnalysisJob
        deleted_dets = db.query(Detection).delete(synchronize_session=False)
        deleted_tracks = db.query(Track).delete(synchronize_session=False)
        deleted_events = db.query(SecurityEvent).delete(synchronize_session=False)
        deleted_alerts = db.query(Alert).delete(synchronize_session=False)
        deleted_plates = db.query(DetectedPlate).delete(synchronize_session=False)
        deleted_snaps = db.query(Snapshot).delete(synchronize_session=False)
        deleted_jobs = db.query(AnalysisJob).delete(synchronize_session=False)
        db.commit()
        total_deleted = deleted_dets + deleted_events + deleted_alerts + deleted_plates
        logger.info(f"Storage purge executed: {deleted_dets} detections, {deleted_events} events, {deleted_plates} plates cleared")
        return {
            "status": "success",
            "message": "Operational surveillance data, ANPR plates, and alerts purged successfully",
            "deleted_count": total_deleted
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Storage purge error: {e}")
        return {"status": "error", "message": str(e)}

