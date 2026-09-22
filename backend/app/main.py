import os
import logging
import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings, STORAGE_DIR, VIDEOS_DIR, EVIDENCE_DIR
from app.database import init_db, SessionLocal
from app.models import Camera, Video, RestrictedZone, AlertRule, Operator, DetectedPlate, WatchlistPlate
from app.routers import (
    websocket, cameras, videos, alerts, events, system,
    analytics, threat, analysis, settings as settings_router,
    zones, rules, audit_logs, reports, admin, search, operators,
    anpr
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("surveillance.main")

def seed_defaults():
    db = SessionLocal()
    try:
        from app.models import AnalysisJob
        from app.routers.videos import get_video_metadata

        # Reset stale running jobs/videos left from any prior interrupted process
        db.query(AnalysisJob).filter(AnalysisJob.status.in_(["RUNNING", "PROCESSING"])).update({"status": "STOPPED"})
        db.query(Video).filter(Video.processing_status.in_(["RUNNING", "PROCESSING"])).update({"processing_status": "IDLE"})
        db.commit()

        core_cams = [
            Camera(
                id="CAM-01",
                name="CAM-01 - North Perimeter",
                location="Post 44A - Western Sector",
                sector="Sector Alpha",
                status="ACTIVE",
                restricted_zone=[[0.0, 0.20], [0.55, 0.38], [0.50, 0.52], [0.0, 0.38]],
                border_line=[[0.0, 0.42], [0.95, 0.42]]
            ),
            Camera(
                id="CAM-02",
                name="CAM-02 - River Crossing",
                location="River Basin Transit Point",
                sector="Sector Bravo",
                status="ACTIVE"
            ),
            Camera(
                id="CAM-03",
                name="CAM-03 - Ridge Line",
                location="Forward Ridge Observation Post",
                sector="Sector Charlie",
                status="ACTIVE"
            ),
            Camera(
                id="CAM-04",
                name="CAM-04 - South Gate",
                location="Delta Pass Checkpoint",
                sector="Sector Delta",
                status="IDLE"
            )
        ]
        for c in core_cams:
            existing_cam = db.query(Camera).filter(Camera.id == c.id).first()
            if not existing_cam:
                db.add(c)
        db.commit()
        logger.info("Ensured core camera stations (CAM-01 to CAM-04).")

        # Seed initial restricted zone for CAM-01 if empty
        if db.query(RestrictedZone).count() == 0:
            db.add(RestrictedZone(
                camera_id="CAM-01",
                name="Sector Alpha Primary Buffer Zone",
                polygon_coords=[[0.0, 0.20], [0.55, 0.38], [0.50, 0.52], [0.0, 0.38]],
                enabled=True,
                description="Zero-tolerance inner perimeter boundary buffer"
            ))
            db.commit()
            logger.info("Seeded default restricted zone.")

        # Seed default alert rules if empty
        if db.query(AlertRule).count() == 0:
            db.add_all([
                AlertRule(
                    rule_type="ZONE_BREACH",
                    name="Restricted Zone Breach",
                    enabled=True,
                    threshold=0.0,
                    severity="Critical",
                    cooldown_seconds=5,
                    parameters={"target_types": ["person", "vehicle"]}
                ),
                AlertRule(
                    rule_type="LOITERING",
                    name="Loitering Detection",
                    enabled=True,
                    threshold=4.0,
                    severity="Medium",
                    cooldown_seconds=15,
                    parameters={"dwell_seconds": 4.0}
                ),
                AlertRule(
                    rule_type="FENCE_APPROACH",
                    name="Movement Towards Border Fence",
                    enabled=True,
                    threshold=15.0,
                    severity="High",
                    cooldown_seconds=10,
                    parameters={"proximity_meters": 15.0}
                )
            ])
            db.commit()
            logger.info("Seeded default alert rules.")

        # Sync disk videos into DB with actual container metadata
        for fn in os.listdir(VIDEOS_DIR):
            if fn.endswith(('.mp4', '.avi', '.mov', '.mkv')):
                v_path = str(VIDEOS_DIR / fn)
                dur, res, fps, frames = get_video_metadata(v_path)
                existing = db.query(Video).filter(Video.filename == fn).first()
                if not existing:
                    db.add(Video(
                        filename=fn,
                        filepath=v_path,
                        duration=dur,
                        resolution=res,
                        fps=fps,
                        total_frames=frames,
                        camera_id="CAM-01",
                        processing_status="IDLE"
                    ))
                elif existing.total_frames <= 0 or existing.duration <= 0.0:
                    existing.duration = dur
                    existing.resolution = res
                    existing.fps = fps
                    existing.total_frames = frames
                    existing.filepath = v_path
        db.commit()

        # Seed default operators if table is empty
        if db.query(Operator).count() == 0:
            pwd_hash1, salt1 = operators.hash_password("operator123")
            pwd_hash2, salt2 = operators.hash_password("commander123")
            db.add_all([
                Operator(
                    username="operator",
                    password_hash=pwd_hash1,
                    salt=salt1,
                    full_name="Tactical Surveillance Operator",
                    role="Tactical Operator",
                    bop_sector="BOP Sector Alpha",
                    callsign="EAGLE-01",
                    badge_number="BSF-9942",
                    security_pin="1234",
                    is_active=True
                ),
                Operator(
                    username="commander",
                    password_hash=pwd_hash2,
                    salt=salt2,
                    full_name="Insp. Vikram Rathore",
                    role="Shift Commander",
                    bop_sector="BOP Sector Alpha",
                    callsign="ALPHA-COMMAND",
                    badge_number="BSF-1008",
                    security_pin="9999",
                    is_active=True
                )
            ])
            db.commit()
            logger.info("Seeded default operators.")

        # Seed initial ANPR Watchlist if empty
        if db.query(WatchlistPlate).count() == 0:
            db.add_all([
                WatchlistPlate(
                    plate_number="JK 02 C 9876",
                    category="STOLEN",
                    severity="Critical",
                    description="Reported stolen Mahindra Bolero in Western border sector",
                    owner_info="Rajinder Singh, Kathua",
                    vehicle_model="Mahindra Bolero White",
                    added_by="Sector Commander"
                ),
                WatchlistPlate(
                    plate_number="PB 10 Z 4421",
                    category="SUSPECT_SMUGGLING",
                    severity="High",
                    description="Flagged for suspected contraband transit on GT-Pass",
                    owner_info="Unknown Logistics Broker",
                    vehicle_model="Tata 407 Heavy Pickup",
                    added_by="Intelligence Bureau Unit"
                ),
                WatchlistPlate(
                    plate_number="DL 01 AB 5519",
                    category="UNAUTHORIZED_CROSSING",
                    severity="Critical",
                    description="Blacklisted vehicle attempting unauthorized checkpoint breach",
                    owner_info="Surveillance Flag #741",
                    vehicle_model="Toyota Fortuner Dark Grey",
                    added_by="Base Administrator"
                ),
                WatchlistPlate(
                    plate_number="ARMY 04 B 1008",
                    category="ARMY_OFFICIAL",
                    severity="Info",
                    description="Authorized BSF Logistics Supply Vehicle",
                    owner_info="94th BSF Battalion Logistics",
                    vehicle_model="Ashok Leyland Stallion 4x4",
                    added_by="Base Administrator"
                )
            ])
            db.commit()
            logger.info("Seeded default ANPR watchlist.")
    except Exception as e:
        logger.error(f"Error seeding database defaults: {e}")
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting IBVAP Backend System...")
    init_db()
    seed_defaults()
    yield
    logger.info("Shutting down IBVAP Backend System...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligent Border Video Analysis Platform (IBVAP) Backend",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")
app.mount("/evidence", StaticFiles(directory=str(EVIDENCE_DIR)), name="evidence")
app.mount("/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="videos")

# Health Check
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
def health_check():
    return {
        "status": "OPERATIONAL",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "cv_pipeline": "READY",
        "database": "CONNECTED"
    }

# Include WebSocket router
app.include_router(websocket.router)

# Mount both /api and /api/v1 prefixes for robust frontend compatibility
for prefix in ["/api", "/api/v1"]:
    app.include_router(cameras.router, prefix=prefix)
    app.include_router(videos.router, prefix=prefix)
    app.include_router(alerts.router, prefix=prefix)
    app.include_router(events.router, prefix=prefix)
    app.include_router(system.router, prefix=prefix)
    app.include_router(analytics.router, prefix=prefix)
    app.include_router(threat.router, prefix=prefix)
    app.include_router(analysis.router, prefix=prefix)
    app.include_router(settings_router.router, prefix=prefix)
    app.include_router(zones.router, prefix=prefix)
    app.include_router(rules.router, prefix=prefix)
    app.include_router(audit_logs.router, prefix=prefix)
    app.include_router(reports.router, prefix=prefix)
    app.include_router(admin.router, prefix=prefix)
    app.include_router(search.router, prefix=prefix)
    app.include_router(operators.router, prefix=prefix)
    app.include_router(anpr.router, prefix=prefix)

# Mount Built Frontend (dist) as fallback so http://localhost:8000 also serves the full UI
from pathlib import Path
from fastapi.responses import FileResponse

DIST_DIR = Path(__file__).resolve().parent.parent.parent / "dist"
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    if (DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="frontend_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("storage") or full_path.startswith("evidence") or full_path.startswith("videos"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        file_candidate = DIST_DIR / full_path
        if file_candidate.is_file():
            return FileResponse(file_candidate)
        return FileResponse(DIST_DIR / "index.html")

