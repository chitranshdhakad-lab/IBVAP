from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enforce SQLite foreign keys, WAL mode, and busy timeout for concurrent transactions."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from app.models import (
        Camera, Video, SecurityEvent, Alert, Detection,
        Track, RestrictedZone, AlertRule, AuditLog, Snapshot,
        SystemSetting, AnalysisJob
    )
    Base.metadata.create_all(bind=engine)

    # Safe column and index migrations for SQLite
    with engine.connect() as conn:
        for table, col, col_type in [
            ("security_events", "verified_by", "VARCHAR(128)"),
            ("alerts", "verified_by", "VARCHAR(128)")
        ]:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass # Column already exists

        # Ensure performance indexes exist on legacy tables
        index_stmts = [
            "CREATE INDEX IF NOT EXISTS ix_security_events_camera_id ON security_events (camera_id)",
            "CREATE INDEX IF NOT EXISTS ix_security_events_video_id ON security_events (video_id)",
            "CREATE INDEX IF NOT EXISTS ix_security_events_created_at ON security_events (created_at)",
            "CREATE INDEX IF NOT EXISTS ix_security_events_severity ON security_events (severity)",
            "CREATE INDEX IF NOT EXISTS ix_security_events_verified ON security_events (verified)",
            "CREATE INDEX IF NOT EXISTS ix_security_events_event_type ON security_events (event_type)",
            "CREATE INDEX IF NOT EXISTS ix_detections_camera_id ON detections (camera_id)",
            "CREATE INDEX IF NOT EXISTS ix_detections_video_id ON detections (video_id)",
            "CREATE INDEX IF NOT EXISTS ix_detections_frame_number ON detections (frame_number)",
            "CREATE INDEX IF NOT EXISTS ix_detections_tracking_id ON detections (tracking_id)",
            "CREATE INDEX IF NOT EXISTS ix_detections_category ON detections (category)",
            "CREATE INDEX IF NOT EXISTS ix_alerts_camera_id ON alerts (camera_id)",
            "CREATE INDEX IF NOT EXISTS ix_alerts_event_id ON alerts (event_id)",
            "CREATE INDEX IF NOT EXISTS ix_alerts_status ON alerts (status)",
            "CREATE INDEX IF NOT EXISTS ix_alerts_severity ON alerts (severity)",
            "CREATE INDEX IF NOT EXISTS ix_alerts_created_at ON alerts (created_at)",
            "CREATE INDEX IF NOT EXISTS ix_tracks_camera_id ON tracks (camera_id)",
            "CREATE INDEX IF NOT EXISTS ix_tracks_video_id ON tracks (video_id)",
            "CREATE INDEX IF NOT EXISTS ix_tracks_track_id ON tracks (track_id)",
            "CREATE INDEX IF NOT EXISTS ix_snapshots_event_id ON snapshots (event_id)",
            "CREATE INDEX IF NOT EXISTS ix_snapshots_camera_id ON snapshots (camera_id)",
            "CREATE INDEX IF NOT EXISTS ix_snapshots_video_id ON snapshots (video_id)",
            "CREATE INDEX IF NOT EXISTS ix_analysis_jobs_video_filename ON analysis_jobs (video_filename)",
            "CREATE INDEX IF NOT EXISTS ix_analysis_jobs_camera_id ON analysis_jobs (camera_id)",
            "CREATE INDEX IF NOT EXISTS ix_analysis_jobs_status ON analysis_jobs (status)",
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_timestamp ON audit_logs (timestamp)",
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs (action)",
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_entity ON audit_logs (entity)"
        ]
        for stmt in index_stmts:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

