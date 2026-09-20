# IBVAP — Actual System Architecture Map
**Intelligent Border Video Analysis Platform (IBVAP)**
*Engineering Audit Document — Actual Architecture Trace*
*Generated: September 2026*

---

## 1. High-Level Subsystem Overview

IBVAP is an operational Border Surveillance and Threat Analysis Platform designed for real-time computer vision, tactical rule breach alerting, and incident logging across perimeter camera stations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             FRONTEND (Vite / React)                         │
│  Sidebar (8 modules) • Header • VideoPanel • Tactical Map • Analytics • ... │
└────────────────────────┬────────────────────────────────────▲───────────────┘
                         │ REST Requests                      │ Live Telemetry
                         │ (/api/*)                           │ (ws://* /ws/live/{cam})
                         ▼                                    │
┌─────────────────────────────────────────────────────────────┴───────────────┐
│                           BACKEND (FastAPI / Python)                        │
│  Routers: cameras, videos, analysis, events, analytics, reports, admin, ... │
│  Services: surveillance_service, job_manager, connection_manager, ...       │
└───────┬───────────────────────────────┬─────────────────────────────┬───────┘
        │                               │                             │
        ▼                               ▼                             ▼
┌──────────────────┐          ┌───────────────────┐         ┌─────────────────┐
│  AI / CV PIPELINE│          │  DATABASE LAYER   │         │  FILE STORAGE   │
│ OpenCV VideoCap  │          │ SQLite            │         │ backend/storage/│
│ Ultralytics YOLO │          │ SQLAlchemy ORM    │         │  videos/        │
│ ByteTrack Tracker│          │ (12 tables)       │         │  evidence/      │
│ Rule Engine      │          │ surveillance.db   │         │  models/        │
│ Threat Risk Eng. │          │                   │         │                 │
└──────────────────┘          └───────────────────┘         └─────────────────┘
```

---

## 2. Component-by-Component End-to-End Traces

### Feature 1: Camera Selection & Station Switching
- **UI Component**: `LiveMonitorPage.jsx` (`.cam-quick-chips`), `Header.jsx` (`select`), `BorderMapPage.jsx` (`<g onClick>`), `BorderMap.jsx` (`<g onClick>`).
- **React State/Hook**: `selectedCamera` in `Dashboard.jsx`, passed down to `LiveMonitorPage`, `Header`, `VideoPanel`, `BorderMapPage`, `BorderMap`.
- **Service / API**: `GET /api/cameras` (fetched by `fetchCameras` in `Dashboard.jsx`).
- **FastAPI Route**: `GET /api/cameras` in `backend/app/routers/cameras.py`.
- **Service / Logic**: Queries `db.query(Camera).all()`.
- **Database / File**: Reads from `cameras` table in `backend/storage/surveillance.db`.
- **Response / WebSocket**: 
  - REST returns `List[CameraOut]`.
  - `useSurveillanceWebSocket(selectedCamera)` in `Dashboard.jsx` detects camera change in dependency array `[cameraId]`, closes old WebSocket to `ws://localhost:8000/ws/live/{oldCamera}`, and opens new connection to `ws://localhost:8000/ws/live/{newCamera}`.
- **UI Update**: `VideoPanel` HUD updates camera station title; `BorderMap` shifts active radar pulse; telemetry filters to target camera.

---

### Feature 2: Video Selection & Registration
- **UI Component**: `VideoPanel.jsx` (`select.control-select`), `VideoLibraryPage.jsx` (`Uploaded Videos` table).
- **React State/Hook**: `selectedVideo` in `Dashboard.jsx`.
- **Service / API**: 
  - `GET /api/videos` (fetched by `fetchVideos` in `Dashboard.jsx`).
  - WebSocket sendCommand `{ action: "select_video", video: filename }`.
- **FastAPI Route**: 
  - `GET /api/videos` in `backend/app/routers/videos.py`.
  - `ws://localhost:8000/ws/live/{camera_id}` in `backend/app/routers/websocket.py`.
- **Service / Logic**: 
  - Syncs disk files in `backend/storage/videos/` with `Video` table.
  - `surveillance_service.select_video(camera_id, video_filename)`.
- **Database / File**: `videos` table in SQLite; `backend/storage/videos/*.mp4`.
- **Response / WebSocket**: WebSocket transmits idle/running state packet containing `"video_filename": filename`.
- **UI Update**: `VideoPanel` loads `<video src="/videos/{filename}">` or MJPEG stream for target video; duration and resolution update in HUD.

---

### Feature 3: Surveillance Analysis Pipeline Execution (Start / Stop)
- **UI Component**: `VideoPanel.jsx` (`button.btn-analysis-toggle`), `VideoLibraryPage.jsx` (`button.btn-queue-stop`).
- **React State/Hook**: `handleToggleAnalysis` in `Dashboard.jsx`, `analysisActive`, `jobStatus`.
- **Service / API**:
  - `POST /api/analysis/start` with payload `{"video": filename, "camera_id": camera_id}`.
  - WebSocket sendCommand `{ action: "start_analysis", video: filename, camera_id: camera_id }`.
  - Stop: `POST /api/analysis/stop`.
- **FastAPI Route**: `POST /api/analysis/start`, `POST /api/analysis/stop` in `backend/app/routers/analysis.py`.
- **Service / Logic**: 
  - `surveillance_service.start_session(camera_id, video_filename, loop=True, frame_stride=2)` creates background `asyncio.create_task(self._worker(...))`.
  - Worker loop:
    1. Opens `cv2.VideoCapture(video_path)`.
    2. Reads frame: `ret, frame = cap.read()`.
    3. Runs in thread pool: `pipeline.process_frame(frame, frame_idx, video_timestamp)`.
    4. YOLOv8 Nano: `detector.track(frame, persist=True)`.
    5. Tracker: `tracker.update(raw_tracked, current_timestamp=video_timestamp)`.
    6. Rule Engine: `rule_engine.evaluate(...)` checking polygon boundary & fence line.
    7. Threat Risk Engine: `risk_engine.compute_threat(...)`.
    8. Updates in-memory stream buffer: `update_stream_frame(camera_id, buf_enc.tobytes())`.
    9. Persists detections to `detections` table (every 15 frames) and security events to `security_events` table on breach.
    10. Encodes snapshot frame to `backend/storage/evidence/evidence_CAM-01_*.jpg` and `public/evidence/`.
    11. Broadcasts telemetry packet over WebSocket: `manager.broadcast_to_camera(camera_id, json.dumps(packet))`.
- **Database / File**: 
  - `AnalysisJob` row updated to `RUNNING` or `STOPPED`.
  - `Detection`, `SecurityEvent`, `Alert` rows written to SQLite.
  - Snapshot images written to `backend/storage/evidence/`.
- **Response / WebSocket**: Continuous live telemetry packet every frame stride (~12-15 FPS):
  ```json
  {
    "camera_id": "CAM-01",
    "video_filename": "Border_Test_03.mp4",
    "job_status": "RUNNING",
    "frame_index": 45,
    "total_frames": 270,
    "progress_percent": 16.7,
    "fps": 25.0,
    "analysis_active": true,
    "live_intelligence": { "persons": 1, "vehicles": 0, "animals": 0, "active_tracks": 1 },
    "threat_assessment": { "score": 85, "level": "HIGH RISK", "key_factors": [...] },
    "active_entities": [...],
    "latest_event": {...}
  }
  ```
- **UI Update**:
  - `VideoPanel`: Switches to MJPEG stream `<img src="/api/analysis/stream/CAM-01">` with bounding boxes and trajectory trails.
  - `IntelligencePanel`: Persons/Vehicles/Active tracks counters update in real-time.
  - `ThreatAssessment`: Needle gauge animates; threat level and key factors update.
  - `CurrentEvent`: Displays snapshot and target metrics if incident occurs.
  - `RecentEvents`: Automatically prepends triggered alert.

---

### Feature 4: Event Verification & Incident Auditing
- **UI Component**: `CurrentEvent.jsx` (`Verify Alert` button), `RecentEvents.jsx` (`CheckCircle` button), `EventsAlertsPage.jsx` (`Verify` button).
- **React State/Hook**: `handleEventVerified(eventId)` in `Dashboard.jsx` and `EventsAlertsPage.jsx`.
- **Service / API**: `PATCH /api/events/{eventId}/verify` with payload `{"verified_by": "Operator - MHA Tactical Console"}`.
- **FastAPI Route**: `PATCH /api/events/{event_id}/verify` in `backend/app/routers/events.py`.
- **Service / Logic**: 
  - Updates `SecurityEvent.verified = True`, `verified_by`, `verified_at = datetime.utcnow()`.
  - Updates linked `Alert.status = "VERIFIED"`.
  - Calls `log_audit(db, "EVENT_VERIFIED", "SecurityEvent", ...)` to insert row into `audit_logs`.
- **Database / File**: Updates `security_events` and `alerts` tables; inserts into `audit_logs`.
- **Response / WebSocket**: Returns `{ "id": eventId, "verified": true, "status": "VERIFIED", ... }`.
- **UI Update**: Unverified badge count decrements across Header and Sidebar; verification badge changes to green checkmark across all screens.

---

### Feature 5: Tactical Map & Incident Localization
- **UI Component**: `BorderMapPage.jsx` and mini `BorderMap.jsx`.
- **React State/Hook**: `cameras`, `selectedCamera`, `eventsList`, `activeLayer`.
- **Service / API**: `GET /api/cameras`, `GET /api/events`.
- **FastAPI Route**: `/api/cameras`, `/api/events`.
- **Service / Logic**: Maps camera geospatial coordinates and incident points onto an SVG sector coordinate space.
- **Database / File**: `cameras` table and `security_events` table.
- **Response / WebSocket**: REST query responses.
- **UI Update**: Renders sector fence line, restricted buffer zones, camera nodes with real-time online/offline status, and pulsing red incident markers. Clicking an incident marker opens details panel.

---

### Feature 6: Operational Analytics & Aggregations
- **UI Component**: `AnalyticsPage.jsx`.
- **React State/Hook**: `timeRange` ('24h', '7d', '30d', 'all'), `summary`, `threatHistory`, `eventsByType`.
- **Service / API**: 
  - `GET /api/analytics/summary?time_range={timeRange}`
  - `GET /api/analytics/threat-history?limit=15`
  - `GET /api/analytics/events-by-type`
- **FastAPI Route**: Endpoints in `backend/app/routers/analytics.py`.
- **Service / Logic**: Computes SQL aggregations (`COUNT`, `AVG`, `MAX`, `GROUP BY`) with time cutoffs.
- **Database / File**: Reads from `security_events` and `detections` tables.
- **Response / WebSocket**: Aggregated metric JSON structures.
- **UI Update**: Displays genuine database totals (total detections, total tracks, severity breakdown bar chart, category distribution, risk score timeline).

---

### Feature 7: Verified PDF & CSV Report Generation
- **UI Component**: `ExportReportModal.jsx` and page export buttons.
- **React State/Hook**: `reportType`, `exportFormat`, `selectedStation`, `selectedTimeRange`.
- **Service / API**: `GET /api/reports/export?report_type={type}&format={format}&camera_id={cam}&time_range={range}`.
- **FastAPI Route**: `GET /api/reports/export` in `backend/app/routers/reports.py`.
- **Service / Logic**: 
  - Queries filtered `SecurityEvent` and `Detection` records.
  - In `backend/app/services/report_generator.py`:
    - If PDF: Generates genuine binary PDF (`%PDF-1.4`) using ReportLab with tables, headers, and metadata.
    - If CSV: Generates formatted CSV string.
  - Logs action: `log_audit(db, "REPORT_EXPORTED", "Report", ...)`.
- **Database / File**: Reads SQLite tables; writes `audit_logs` entry.
- **Response / WebSocket**: Direct file download response with `Content-Disposition: attachment; filename=...`.
- **UI Update**: Browser triggers file download modal automatically.

---

### Feature 8: System Status & Diagnostic Telemetry
- **UI Component**: `SystemStatusPage.jsx` and Header health indicator.
- **React State/Hook**: `statusData`, polling interval (8 seconds).
- **Service / API**: `GET /api/system/status`.
- **FastAPI Route**: `GET /api/system/status` in `backend/app/routers/system.py`.
- **Service / Logic**: 
  - Queries `psutil.cpu_percent()`, `psutil.virtual_memory()`.
  - Queries `shutil.disk_usage()` for physical storage.
  - Inspects `MODELS_DIR / "yolov8n.pt"` file size.
  - Inspects `torch.cuda.is_available()`.
  - Inspects `job_manager.to_dict()`.
  - Compiles status array of 12 real subsystems.
- **Database / File**: Checks SQLite database query health and count of cameras/events/detections.
- **Response / WebSocket**: Subsystem status payload.
- **UI Update**: Diagnostic cards show live CPU load, RAM usage, storage %, model status, and subsystem badges (`ONLINE`, `RUNNING`, `DEGRADED`, `NOT CONFIGURED`).

---

### Feature 9: Administrative Controls & Dangerous Resets
- **UI Component**: `SettingsPage.jsx` (Danger Zone tab).
- **React State/Hook**: `resetConfirmText`, `isResetting`, `dangerMsg`.
- **Service / API**:
  - `POST /api/admin/reset-settings`
  - `POST /api/admin/reset-data` with payload `{"confirmation": "RESET IBVAP", "delete_cameras": false, "delete_videos": false}`.
- **FastAPI Route**: Endpoints in `backend/app/routers/admin.py`.
- **Service / Logic**: 
  - Halts any active `job_manager` worker.
  - Executes atomic SQLAlchemy transaction to delete operational records.
  - Deletes physical snapshot files from `backend/storage/evidence/`.
  - Logs action in `audit_logs`.
- **Database / File**: Purges `detections`, `tracks`, `alerts`, `security_events`, `snapshots`, `analysis_jobs`.
- **Response / WebSocket**: `{ "status": "SUCCESS", "cleaned_snapshots": N, ... }`.
- **UI Update**: Clears in-memory lists, reloads audit log table, and notifies user.
