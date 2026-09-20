# IBVAP — Complete Technical Pipeline Trace

**Project:** Intelligent Border Video Analysis Platform (IBVAP)  
**Audit Date:** September 18, 2026  
**Methodology:** Direct code inspection and runtime execution trace on real video (`Border_Test_03.mp4`).

---

## 1. End-to-End Pipeline Architecture Diagram

```
SURVEILLANCE VIDEO FILE (MP4 / CCTV)
    ↓
1. OpenCV VideoCapture (`cv2.VideoCapture`)
   [backend/app/ai/pipeline.py : SurveillancePipeline.stream_video()]
    ↓
2. Frame Extraction & Normalization (`cv2.imread / cap.read`)
   [backend/app/ai/pipeline.py : SurveillancePipeline.process_frame()]
    ↓
3. YOLOv8 Deep Learning Inference (`ultralytics.YOLO("yolov8n.pt")`)
   [backend/app/ai/detector.py : ObjectDetector.detect()]
    ↓
4. Bounding Box & Class Filtering
   [backend/app/ai/detector.py : categorize_class()]
    ↓
5. Object Tracking & Trajectory History
   [backend/app/ai/tracker.py : MultiObjectTracker.update()]
    ↓
6. Movement & Velocity Calculation (Direction & Speed)
   [backend/app/ai/tracker.py : TrackedObject.update()]
    ↓
7. Tactical Rule Engine (Restricted Zone & Border Line)
   [backend/app/ai/rule_engine.py : TacticalRuleEngine.evaluate()]
    ↓
8. Incident State Machine & Cooldown Debounce
   [backend/app/ai/rule_engine.py : TrackIncidentState]
    ↓
9. Threat Assessment & Risk Score Engine (0–100 Deterministic)
   [backend/app/ai/risk_engine.py : ThreatRiskEngine.compute_threat()]
    ↓
10. Evidence Snapshot Capture (`cv2.imwrite`)
    [backend/app/ai/pipeline.py : cv2.imwrite(EVIDENCE_DIR / filename)]
    ↓
11. SQLite Database Persistence
    [backend/app/models.py : SecurityEvent, Alert, Detection]
    [backend/storage/surveillance.db]
    ↓
12. FastAPI Application & REST Endpoints
    [backend/app/routers/events.py, videos.py, cameras.py, system.py]
    ↓
13. Live WebSocket Telemetry Dispatcher
    [backend/app/routers/websocket.py : websocket_live_stream()]
    ↓
14. React Custom WebSocket Hook
    [src/services/useSurveillanceWebSocket.js : useSurveillanceWebSocket()]
    ↓
15. React Command-Center Dashboard Views
    [src/components/Dashboard.jsx, VideoPanel.jsx, IntelligencePanel.jsx,
     ThreatAssessment.jsx, CurrentEvent.jsx, EventTimeline.jsx, SystemStatus.jsx]
```

---

## 2. Step-by-Step Codebase Mapping

### Step 1: Video File Ingestion
- **File:** `backend/app/ai/pipeline.py`
- **Class / Function:** `SurveillancePipeline.stream_video(loop=True)`
- **Mechanism:** Opens `self.video_path` via `cv2.VideoCapture(self.video_path)`. Extracts native video properties: `width`, `height`, and `fps = cap.get(cv2.CAP_PROP_FPS) or 25.0`.
- **Runtime Proof:** `Border_Test_03.mp4` (960×540, 30.00 FPS, 270 frames total, 9.00s duration).

### Step 2: OpenCV Frame Reading
- **File:** `backend/app/ai/pipeline.py`
- **Function:** `SurveillancePipeline.process_frame(frame, frame_idx, video_timestamp)`
- **Mechanism:** In a generator loop, calls `ret, frame = cap.read()`. If `not ret` and `loop=True`, resets frame pointer via `cap.set(cv2.CAP_PROP_POS_FRAMES, 0)`.
- **Cleanup:** `cap.release()` called upon loop exit or pipeline termination.

### Step 3: YOLOv8 Inference
- **File:** `backend/app/ai/detector.py`
- **Class / Function:** `ObjectDetector.detect(frame, allowed_classes=None)`
- **Model Loaded:** `ultralytics.YOLO("backend/models/yolov8n.pt")` (6.25 MB weights file).
- **Execution:** Runs `results = self.model(frame, conf=0.30, verbose=False)`.
- **Extraction:** Loops over `results[0].boxes`, extracting `box.cls`, `box.conf`, and `box.xyxy`. Coordinates are normalized to `[0.0, 1.0]` by dividing by frame width `w` and height `h`.

### Step 4: Class Categorization & Fallback
- **File:** `backend/app/ai/detector.py`
- **Function:** `categorize_class(class_name)`
- **Class Mappings:**
  - `PERSON_CLASSES = {"person"}` $\rightarrow$ category `"person"`
  - `VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle", "vehicle"}` $\rightarrow$ category `"vehicle"`
  - `ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"}` $\rightarrow$ category `"animal"`
- **Fallback Engine:** If YOLO weights are missing, `cv2.createBackgroundSubtractorMOG2()` detects motion contours. Following audit fix, MOG2 strictly outputs `class="motion"`, `category="motion"` (never guessing person/vehicle/animal).

### Step 5: Multi-Object Tracking
- **File:** `backend/app/ai/tracker.py`
- **Class / Function:** `MultiObjectTracker.update(detections, current_timestamp)`
- **Algorithm:** Custom greedy IoU tracker (Intersection-over-Union matching with `min_iou=0.25`).
- **Persistence:** Matches incoming detection bounding boxes to active `TrackedObject` instances. Preserves unique `tracking_id`. Unmatched detections spawn a new incrementing `tracking_id`.
- **Missed Objects:** Unmatched tracks increment `time_since_update`; tracks are purged after `max_age=15` missed frames.

### Step 6: Movement & Estimated Speed Calculation
- **File:** `backend/app/ai/tracker.py`
- **Function:** `TrackedObject.update(bbox, confidence, timestamp)`
- **Center Point:** `((x1+x2)/2, (y1+y2)/2)`
- **Displacement:** Euclidean distance `sqrt(dx^2 + dy^2)` in normalized screen space.
- **Velocity Vector:** `vx = dx / dt`, `vy = dy / dt` where `dt = timestamp - last_seen`.
- **Direction:** Evaluated relative to border fence line:
  - If `vy < -0.01` or `vx < -0.01` $\rightarrow$ `"Towards Border"`
  - If `abs(vx) > abs(vy)` $\rightarrow$ `"Parallel to Fence"`
  - Else $\rightarrow$ `"Moving Away"` / `"Stationary"`
- **Speed Metric:** Labeled as `"Est. X.X px/s"` (estimated image-space speed, avoiding uncalibrated real-world claims).

### Step 7: Tactical Rule Engine
- **File:** `backend/app/ai/rule_engine.py`
- **Class / Function:** `TacticalRuleEngine.evaluate(...)`
- **Polygon Point-in-Polygon:** Ray-casting algorithm testing target bottom-center point `((x1+x2)/2, y2)` against normalized polygon `[[0.0, 0.20], [0.55, 0.38], [0.50, 0.52], [0.0, 0.38]]`.
- **Distance to Fence:** Perpendicular distance from target to border line segment `[[0.0, 0.42], [0.95, 0.42]]`.

### Step 8: Event State Machine & Debouncing
- **File:** `backend/app/ai/rule_engine.py`
- **Class:** `TrackIncidentState`
- **Logic:**
  - When target transitions from OUTSIDE $\rightarrow$ INSIDE restricted zone, fires `"Zone breach"` ONCE.
  - While target remains inside, `in_restricted_zone` remains True; duplicate breach alerts are suppressed every frame.
  - When dwell time exceeds `loiter_threshold_seconds` (configured default 4.0s), triggers `"Loitering alert"` ONCE.
  - When target approaches fence (`dist_to_fence < 15m` and direction `"Towards Border"`), fires `"Movement towards fence"` ONCE.

### Step 9: Threat Assessment Engine
- **File:** `backend/app/ai/risk_engine.py`
- **Class / Function:** `ThreatRiskEngine.compute_threat(active_entities, any_zone_breach, is_night)`
- **Scoring Breakdown:**
  - Base: `10`
  - Person detected: `+25`
  - Movement towards boundary: `+20`
  - Night condition: `+10`
  - Restricted zone breach active: `+30`
  - Dwell time > 45 sec: `+15` (strictly gated on `high_dwell`)
- **Output:** Score clamped to `[0, 100]`, level (`"SECURE"`, `"LOW RISK"`, `"MEDIUM RISK"`, `"HIGH RISK"`), and list of active key factors.

### Step 10: Evidence Snapshot Generation
- **File:** `backend/app/ai/pipeline.py` (lines 109–120)
- **Mechanism:** When `rule_res["should_alert"]` is True:
  - Generates filename `evidence_{camera_id}_{timestamp}_{tracking_id}.jpg`.
  - Saves full video frame via `cv2.imwrite()` to `backend/storage/evidence/`.
  - Also syncs to `public/evidence/` for immediate frontend asset accessibility.
  - Stores public URL path `/storage/evidence/...` in database record.

### Step 11: SQLite Database Persistence
- **Files:** `backend/app/models.py`, `backend/app/database.py`
- **Database File:** `backend/storage/surveillance.db`
- **Entities Persisted:**
  - `SecurityEvent`: ID, event_type, camera_id, timestamp, video_timestamp, tracking_id, object_class, severity, risk_score, key_factors, details, snapshot_path, verified.
  - `Alert`: ID, title, severity, status, camera_id, event_id.
  - `Detection`: Samples recorded every 15 frames for telemetry audit.

### Step 12: FastAPI REST API Exposure
- **Files:** `backend/app/routers/events.py`, `backend/app/routers/analytics.py`, `backend/app/routers/system.py`
- **Endpoints:**
  - `GET /api/events` $\rightarrow$ List of recorded events
  - `GET /api/events/current` $\rightarrow$ Latest incident query
  - `PATCH /api/events/{id}/verify` $\rightarrow$ Operator verification persistence
  - `GET /api/analytics/summary` $\rightarrow$ SQLite-aggregated metrics
  - `GET /api/system/status` $\rightarrow$ Genuine psutil hardware telemetry

### Step 13: Live WebSocket Transmission
- **File:** `backend/app/routers/websocket.py`
- **Endpoint:** `ws://localhost:8000/ws/live/{camera_id}`
- **Payload Structure:**
  ```json
  {
    "camera_id": "CAM-01",
    "frame_index": 73,
    "video_timestamp": 2.43,
    "analysis_active": true,
    "live_intelligence": {
      "persons": 1,
      "vehicles": 0,
      "animals": 0,
      "active_tracks": 1
    },
    "threat_assessment": {
      "score": 65,
      "level": "MEDIUM RISK",
      "key_factors": ["Person detected", "Movement towards boundary", "Night condition"]
    },
    "active_entities": [ ... ],
    "latest_event": { ... }
  }
  ```

### Step 14: React WebSocket Hook State Ingestion
- **File:** `src/services/useSurveillanceWebSocket.js`
- **Function:** `useSurveillanceWebSocket(cameraId)`
- **Action:** Maintains WebSocket lifecycle, parses JSON frames on `ws.onmessage`, and dispatches state updates to:
  - `setLiveIntelligence(data.live_intelligence)`
  - `setThreatAssessment(data.threat_assessment)`
  - `setActiveEntities(data.active_entities)`
  - `setLatestEvent(data.latest_event)`

### Step 15: React UI Dashboard Rendering
- **Main View:** `src/components/Dashboard.jsx`
- **Subcomponents:**
  - `VideoPanel.jsx`: Renders HTML5 `<video>`, bounding box SVG overlay from `activeEntities`, HUD pills.
  - `IntelligencePanel.jsx`: Renders stat cards for Persons, Vehicles, Animals, Active Tracks from `liveIntelligence`.
  - `ThreatAssessment.jsx`: Renders SVG gauge arc and key factors from `threatAssessment`.
  - `CurrentEvent.jsx`: Renders incident title, snapshot image, time, estimated speed, dwell time, and verification button from `currentEvent`.
  - `EventTimeline.jsx`: Maps incident pins along duration ruler with interactive video seek.
  - `RecentEvents.jsx`: Displays scrollable list of recent database incidents.
  - `SystemStatus.jsx`: Displays genuine system diagnostics (CPU, RAM, Disk, DB, AI engine).
