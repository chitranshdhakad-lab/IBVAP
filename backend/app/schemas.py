from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class CameraCreate(BaseModel):
    id: str
    name: str
    location: str
    sector: str
    status: str = "ACTIVE"
    source_type: Optional[str] = "FILE" # "FILE" or "RTSP"
    source: Optional[str] = ""
    restricted_zone: Optional[List[List[float]]] = None
    border_line: Optional[List[List[float]]] = None

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    sector: Optional[str] = None
    status: Optional[str] = None
    source_type: Optional[str] = None
    source: Optional[str] = None
    restricted_zone: Optional[List[List[float]]] = None
    border_line: Optional[List[List[float]]] = None

class CameraOut(BaseModel):
    id: str
    name: str
    location: str
    sector: str
    status: str
    source_type: Optional[str] = "FILE"
    source: Optional[str] = ""
    created_at: Optional[Any] = None
    last_seen: Optional[Any] = None
    restricted_zone: Optional[List[List[float]]] = None
    border_line: Optional[List[List[float]]] = None
    assigned_video_id: Optional[int] = None

    class Config:
        from_attributes = True

class SystemSettingsOut(BaseModel):
    yolo_confidence_threshold: float
    processing_fps: int
    model_path: str
    loitering_threshold_seconds: float
    event_cooldown_seconds: float
    restricted_zone_enabled: bool
    border_line_enabled: bool
    virtual_fence_enabled: bool = True
    risk_weights: Dict[str, float]

    # AI Detection Classes
    person_detection: bool = True
    animal_detection: bool = True
    vehicle_detection: bool = True
    unknown_object_detection: bool = True
    weapon_detection: bool = True  # From reference project: pistol/rifle/knife detection
    face_detection: bool = False   # From reference project: Haar Cascade face detection

    # Alert Toggles
    intrusion_alerts: bool = True
    animal_alerts: bool = True
    vehicle_alerts: bool = True
    cross_border_alerts: bool = True
    weapon_alerts: bool = True  # From reference project: weapon detection alerts
    sound_notifications: bool = True
    email_notifications: bool = False
    sms_notifications: bool = False

    # Display Settings
    show_detection_boxes: bool = True
    show_confidence_score: bool = True
    show_timestamps: bool = True
    night_mode_enhancement: bool = False
    default_view: str = "live-monitor"
    grid_layout: str = "2x2"

    # Camera Settings
    default_stream_quality: str = "1080p"
    auto_reconnect: bool = True
    stream_buffer_seconds: int = 5
    show_camera_status: bool = True

    # Data & Storage Settings
    store_detections: bool = True
    video_recording: bool = True
    retention_period: str = "30 Days"
    auto_delete_old_data: bool = True
    export_format: str = "MP4"

    # General Settings
    system_name: str = "IBVAP - Border Surveillance System"
    time_zone: str = "Asia/Kolkata"
    language: str = "en"
    theme: str = "light"

class SystemSettingsUpdate(BaseModel):
    yolo_confidence_threshold: Optional[float] = None
    processing_fps: Optional[int] = None
    model_path: Optional[str] = None
    loitering_threshold_seconds: Optional[float] = None
    event_cooldown_seconds: Optional[float] = None
    restricted_zone_enabled: Optional[bool] = None
    border_line_enabled: Optional[bool] = None
    virtual_fence_enabled: Optional[bool] = None
    risk_weights: Optional[Dict[str, float]] = None

    # AI Detection Classes
    person_detection: Optional[bool] = None
    animal_detection: Optional[bool] = None
    vehicle_detection: Optional[bool] = None
    unknown_object_detection: Optional[bool] = None
    weapon_detection: Optional[bool] = None  # From reference project: pistol/rifle/knife detection
    face_detection: Optional[bool] = None    # From reference project: Haar Cascade face detection

    # Alert Toggles
    intrusion_alerts: Optional[bool] = None
    animal_alerts: Optional[bool] = None
    vehicle_alerts: Optional[bool] = None
    cross_border_alerts: Optional[bool] = None
    weapon_alerts: Optional[bool] = None  # From reference project: weapon detection alerts
    sound_notifications: Optional[bool] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None

    # Display Settings
    show_detection_boxes: Optional[bool] = None
    show_confidence_score: Optional[bool] = None
    show_timestamps: Optional[bool] = None
    night_mode_enhancement: Optional[bool] = None
    default_view: Optional[str] = None
    grid_layout: Optional[str] = None

    # Camera Settings
    default_stream_quality: Optional[str] = None
    auto_reconnect: Optional[bool] = None
    stream_buffer_seconds: Optional[int] = None
    show_camera_status: Optional[bool] = None

    # Data & Storage Settings
    store_detections: Optional[bool] = None
    video_recording: Optional[bool] = None
    retention_period: Optional[str] = None
    auto_delete_old_data: Optional[bool] = None
    export_format: Optional[str] = None

    # General Settings
    system_name: Optional[str] = None
    time_zone: Optional[str] = None
    language: Optional[str] = None
    theme: Optional[str] = None

class AnalysisJobOut(BaseModel):
    id: int
    video_id: Optional[int] = None
    video_filename: str
    camera_id: str
    status: str
    started_at: Any
    completed_at: Optional[Any] = None
    processed_frames: int
    total_frames: int
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class VideoOut(BaseModel):
    id: int
    filename: str
    duration: float
    resolution: str
    fps: float
    camera_id: Optional[str] = None
    processing_status: str

    class Config:
        from_attributes = True

class EventOut(BaseModel):
    id: int
    event_type: str
    camera_id: str
    timestamp: str
    video_timestamp: float
    tracking_id: Optional[int] = None
    object_class: str
    category: str
    severity: str
    risk_score: int
    key_factors: List[str] = []
    snapshot_path: Optional[str] = None

    class Config:
        from_attributes = True

class AlertOut(BaseModel):
    id: int
    title: str
    severity: str
    status: str
    camera_id: str
    created_at: Any
    verified_at: Optional[Any] = None

    class Config:
        from_attributes = True

class ThreatAssessmentOut(BaseModel):
    score: int
    level: str
    description: str
    key_factors: List[str]

class IntelligenceStatsOut(BaseModel):
    persons: int
    vehicles: int
    animals: int
    active_tracks: int
