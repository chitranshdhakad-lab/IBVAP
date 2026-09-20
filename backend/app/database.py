from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}
)

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

    # Safe column migrations for SQLite
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

