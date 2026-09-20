import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String(32), primary_key=True, index=True) # e.g. "CAM-01"
    name = Column(String(128), nullable=False) # e.g. "North Perimeter"
    location = Column(String(256), nullable=False)
    sector = Column(String(64), nullable=False) # e.g. "Sector Alpha"
    status = Column(String(32), default="ACTIVE") # "ACTIVE", "IDLE", "OFFLINE"
    restricted_zone = Column(JSON, nullable=True) # [[x, y], ...]
    border_line = Column(JSON, nullable=True) # [[x, y], ...]
    assigned_video_id = Column(Integer, nullable=True)
    source_type = Column(String(32), default="FILE") # "FILE", "RTSP"
    source = Column(String(512), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_seen = Column(DateTime, nullable=True)

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(256), nullable=False)
    filepath = Column(String(512), nullable=False)
    duration = Column(Float, default=0.0)
    resolution = Column(String(32), default="1920x1080")
    fps = Column(Float, default=25.0)
    camera_id = Column(String(32), ForeignKey("cameras.id"), nullable=True)
    processing_status = Column(String(32), default="IDLE") # "IDLE", "PROCESSING", "COMPLETED", "ERROR"
    total_frames = Column(Integer, default=0)
    processed_frames = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class SecurityEvent(Base):
    __tablename__ = "security_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(64), nullable=False) # "ZONE_INTRUSION", "VEHICLE_DETECTED", "ANIMAL_INCURSION", "LOITERING"
    camera_id = Column(String(32), nullable=False)
    video_id = Column(Integer, nullable=True)
    timestamp = Column(String(32), nullable=False) # e.g. "22:41:32"
    video_timestamp = Column(Float, default=0.0)
    tracking_id = Column(Integer, nullable=True)
    object_class = Column(String(64), nullable=False)
    category = Column(String(32), nullable=False)
    severity = Column(String(32), default="Critical") # "Critical", "High", "Medium", "Low"
    risk_score = Column(Integer, default=50) # 0-100
    key_factors = Column(JSON, default=list) # List of factor strings
    details = Column(JSON, default=dict)
    snapshot_path = Column(String(512), nullable=True)
    verified = Column(Boolean, default=False)
    verified_by = Column(String(128), nullable=True) # e.g. "Operator" or "Administrator"
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(128), nullable=False)
    severity = Column(String(32), default="Critical")
    status = Column(String(32), default="ACTIVE") # "ACTIVE", "VERIFIED", "RESOLVED"
    camera_id = Column(String(32), nullable=False)
    event_id = Column(Integer, ForeignKey("security_events.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    verified_by = Column(String(128), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, nullable=True)
    camera_id = Column(String(32), nullable=False)
    frame_number = Column(Integer, nullable=False)
    timestamp = Column(Float, default=0.0)
    tracking_id = Column(Integer, nullable=True)
    object_class = Column(String(64), nullable=False)
    category = Column(String(32), nullable=False)
    confidence = Column(Float, default=0.0)
    bbox = Column(JSON, nullable=False) # [x1, y1, x2, y2]

class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, nullable=True)
    camera_id = Column(String(32), nullable=False)
    track_id = Column(Integer, nullable=False)
    object_class = Column(String(64), nullable=False)
    category = Column(String(32), nullable=False)
    first_seen_frame = Column(Integer, default=0)
    last_seen_frame = Column(Integer, default=0)
    first_seen_time = Column(Float, default=0.0)
    last_seen_time = Column(Float, default=0.0)
    avg_speed = Column(Float, default=0.0)
    trajectory = Column(JSON, default=list) # [[x, y], ...]
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class RestrictedZone(Base):
    __tablename__ = "restricted_zones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    camera_id = Column(String(32), ForeignKey("cameras.id"), nullable=False)
    name = Column(String(128), nullable=False)
    polygon_coords = Column(JSON, nullable=False) # [[x, y], ...]
    enabled = Column(Boolean, default=True)
    description = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_type = Column(String(64), nullable=False) # "ZONE_BREACH", "LOITERING", "FENCE_APPROACH", "SEVERITY_MAPPING"
    name = Column(String(128), nullable=False)
    enabled = Column(Boolean, default=True)
    threshold = Column(Float, default=0.0) # e.g. dwell seconds or distance in meters
    severity = Column(String(32), default="High") # "Critical", "High", "Medium", "Low"
    cooldown_seconds = Column(Integer, default=15)
    parameters = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    action = Column(String(64), nullable=False) # e.g. "CAMERA_CREATED", "SETTINGS_CHANGED", etc.
    entity = Column(String(64), nullable=False) # e.g. "Camera", "Setting", "Event"
    entity_id = Column(String(128), nullable=True)
    details = Column(Text, nullable=True)
    user = Column(String(128), default="Operator")

class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("security_events.id"), nullable=True)
    camera_id = Column(String(32), nullable=False)
    video_id = Column(Integer, nullable=True)
    filepath = Column(String(512), nullable=False)
    filename = Column(String(256), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    metadata_json = Column(JSON, default=dict)

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(64), primary_key=True, index=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, nullable=True)
    video_filename = Column(String(256), nullable=False)
    camera_id = Column(String(32), nullable=False)
    status = Column(String(32), default="IDLE")  # IDLE, QUEUED, STARTING, RUNNING, PAUSED, STOPPING, COMPLETED, FAILED, CANCELLED
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    processed_frames = Column(Integer, default=0)
    total_frames = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

class Operator(Base):
    __tablename__ = "operators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    salt = Column(String(64), nullable=False)
    full_name = Column(String(128), default="Tactical Operator")
    role = Column(String(64), default="Tactical Operator") # "Tactical Operator", "Shift Commander", "Perimeter Analyst", "Base Administrator"
    bop_sector = Column(String(128), default="BOP Sector Alpha")
    callsign = Column(String(64), default="EAGLE-01")
    security_pin = Column(String(16), default="1234")
    badge_number = Column(String(64), default="BSF-9942")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "bop_sector": self.bop_sector,
            "callsign": self.callsign,
            "badge_number": self.badge_number,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }

class DetectedPlate(Base):
    __tablename__ = "detected_plates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plate_number = Column(String(32), nullable=False, index=True) # e.g. "DL 01 AB 1234"
    raw_text = Column(String(64), nullable=True) # exact text from OCR
    confidence = Column(Float, default=0.0)
    state_code = Column(String(8), nullable=True, index=True) # "DL", "JK", "PB", "HR", "RJ", etc.
    state_name = Column(String(64), nullable=True) # "Delhi", "Jammu & Kashmir", etc.
    vehicle_type = Column(String(32), default="Car") # "Car", "Truck", "Bus", "Motorcycle", "Military Vehicle"
    camera_id = Column(String(32), nullable=False, index=True) # "CAM-01"
    video_id = Column(Integer, nullable=True)
    video_timestamp = Column(Float, default=0.0)
    direction = Column(String(32), default="Stationary") # "Inbound / Approaching Border", "Outbound", "Stationary"
    speed_estimate = Column(String(32), default="Est. 35 km/h")
    crop_image_path = Column(String(512), nullable=True)
    vehicle_image_path = Column(String(512), nullable=True)
    status = Column(String(32), default="NORMAL") # "NORMAL", "FLAGGED_SUSPECT", "STOLEN", "UNAUTHORIZED", "ARMY_AUTHORIZED"
    flag_reason = Column(String(256), nullable=True)
    bbox = Column(JSON, nullable=True) # [x1, y1, x2, y2]
    vehicle_bbox = Column(JSON, nullable=True) # [x1, y1, x2, y2]
    notes = Column(Text, nullable=True)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "plate_number": self.plate_number,
            "raw_text": self.raw_text,
            "confidence": round(self.confidence, 2) if self.confidence else 0.0,
            "state_code": self.state_code,
            "state_name": self.state_name,
            "vehicle_type": self.vehicle_type,
            "camera_id": self.camera_id,
            "video_id": self.video_id,
            "video_timestamp": self.video_timestamp,
            "direction": self.direction,
            "speed_estimate": self.speed_estimate,
            "crop_image_path": self.crop_image_path,
            "vehicle_image_path": self.vehicle_image_path,
            "status": self.status,
            "flag_reason": self.flag_reason,
            "bbox": self.bbox,
            "vehicle_bbox": self.vehicle_bbox,
            "notes": self.notes,
            "verified": self.verified,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class WatchlistPlate(Base):
    __tablename__ = "watchlist_plates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plate_number = Column(String(32), unique=True, nullable=False, index=True)
    category = Column(String(32), default="SUSPECT") # "STOLEN", "SUSPECT_SMUGGLING", "UNAUTHORIZED_CROSSING", "ARMY_OFFICIAL", "VIP_WHITELIST"
    severity = Column(String(32), default="High") # "Critical", "High", "Medium", "Info"
    description = Column(String(256), nullable=True)
    owner_info = Column(String(128), nullable=True)
    vehicle_model = Column(String(64), nullable=True)
    added_by = Column(String(128), default="Border Security Command")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "plate_number": self.plate_number,
            "category": self.category,
            "severity": self.severity,
            "description": self.description,
            "owner_info": self.owner_info,
            "vehicle_model": self.vehicle_model,
            "added_by": self.added_by,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

