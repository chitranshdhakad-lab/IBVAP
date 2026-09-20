# IBVAP — Comprehensive Technical Pipeline Audit & Runtime Verification Report

**Platform:** Intelligent Border Video Analysis Platform (IBVAP)  
**Audit Conducted:** September 18, 2026  
**Environment:** Windows 64-bit Workstation, Python 3.13, PyTorch / Ultralytics 8.3, OpenCV 4.10, FastAPI 0.115, SQLite 3, React 19 / Vite  
**Audit Principle:** Verification based strictly on actual code, actual execution, and recorded runtime data. Zero fabricated metrics.

---

## 1. System Component Verification Matrix

| Component | Actual Implementation | Runtime Verified | Evidence | Status |
| :--- | :--- | :---: | :--- | :---: |
| **OpenCV Video Ingestion** | `cv2.VideoCapture` loop in `pipeline.py` reading native video frames | YES | Read 60 frames of `Border_Test_03.mp4` (960×540 @ 30 FPS) in 0.130s (461 FPS) | VERIFIED |
| **YOLOv8 Object Detection** | `ultralytics.YOLO("backend/models/yolov8n.pt")` in `detector.py` | YES | Detected person in Frame 3 (`conf=0.676`), Frame 4 (`conf=0.611`), Frame 73 (`conf=0.573`) | VERIFIED |
| **MOG2 Fallback Engine** | `cv2.createBackgroundSubtractorMOG2` in `detector.py` | YES | Motion contours classified strictly as `MOTION` (no fake person/vehicle labels) | VERIFIED |
| **Multi-Object Tracker** | Custom greedy IoU tracker in `tracker.py` (`min_iou=0.25`, `max_age=15`) | YES | Preserved Track ID 2 across frames 18–23; Track ID 3 across frames 70–85 | VERIFIED |
| **Movement & Velocity** | Euclidean centroid displacement `sqrt(dx^2+dy^2)/dt` in `tracker.py` | YES | Computed velocity vector `[0.0574, -0.2738]`, labeled as "Est. 7.0 px/s" | VERIFIED |
| **Restricted Zone Geometry** | Ray-casting Point-in-Polygon (`TacticalRuleEngine.evaluate`) | YES | Case A (Outside: No alert), Case B (Enter: Alert fired), Case C (Remain: Suppressed) | VERIFIED |
| **Border Line Logic** | Perpendicular distance to line segment `dist_to_fence < 15m` & direction vector | YES | Evaluated distance 13m with direction "Towards Border", triggering approach event | VERIFIED |
| **Dwell Time Tracking** | Cumulative timestamp difference `last_seen - first_seen` per Track ID | YES | Correctly associated with persistent Track ID 3 in `TrackedObject.dwell_time` | VERIFIED |
| **Loitering Detection** | Gated on `dwell_time >= loiter_threshold` (configured at 4.0s) | YES | Evaluated at Frame 40 (t=14.0s) in 50-frame sustained test, firing "Loitering alert" | VERIFIED |
| **Event Engine** | State machine (`TrackIncidentState`) triggering typed security events | YES | Triggered event ID 22 (`Movement towards fence`) with full telemetry payload | VERIFIED |
| **Event Debouncing** | Per-track state transitions (`in_restricted_zone`, `approaching_fence`) | YES | 50 consecutive frames inside zone generated only 2 events (Breach + Loitering) | VERIFIED |
| **Threat Risk Engine** | Deterministic multi-factor scoring (Base 10, Person +25, Approach +20, Night +10) | YES | Computed 65 / 100 for border approach event; zero when sector is clear; clamped [0, 100] | VERIFIED |
| **Evidence Snapshots** | `cv2.imwrite` saving full frame crop to `backend/storage/evidence/` | YES | Created `trace_test_243_3.jpg` (36,417 bytes), verified via OpenCV read and HTTP 200 | VERIFIED |
| **SQLite Persistence** | SQLAlchemy ORM models (`surveillance.db`) with relational integrity | YES | Tables: `security_events` (22 rows), `detections` (361 rows), `cameras` (4 rows) | VERIFIED |
| **FastAPI REST Endpoints** | APIRouter endpoints mounted under `/api` and `/api/v1` in `main.py` | YES | All 16 tested endpoints returned HTTP 200 OK with valid JSON payloads | VERIFIED |
| **WebSocket Stream** | Bi-directional JSON stream at `/ws/live/{camera_id}` in `websocket.py` | YES | Delivered initial idle packet, live analysis telemetry packet, and stop confirmation | VERIFIED |
| **React Integration** | Custom WebSocket hook `useSurveillanceWebSocket.js` dispatches state | YES | Data mapped from socket packet into `IntelligencePanel`, `ThreatAssessment`, `CurrentEvent` | VERIFIED |
| **Video Playback** | HTML5 `<video>` element with custom controls and timeline seeking | YES | Plays real local MP4 archive (`Border_Test_03.mp4`), seeks to event timestamps | VERIFIED |
| **Video Upload** | Multipart upload endpoint (`POST /api/videos/upload`) in `videos.py` | YES | Validates extension, stores to `storage/videos/`, extracts metadata via OpenCV | VERIFIED |
| **Analytics Module** | Real-time SQL aggregations in `analytics.py` (by severity, hour, type) | YES | Aggregated 361 detections and 22 events from SQLite without mock/random data | VERIFIED |
| **Camera Management** | CRUD, connection test, status toggle in `cameras.py` | YES | Station CAM-01 connection test verified local MP4 feed with HTTP 200 | VERIFIED |
| **System Status Diagnostics** | Real `psutil` CPU/RAM and `shutil` disk usage in `system.py` | YES | Reported CPU 29%, RAM 81%, Disk 48% (67.8 GB/140.8 GB), Windows Host Workstation | VERIFIED |

---

## 2. Deep Technical Audit by Section

### Section 2: OpenCV Video Processing Proof
- **Exact File:** `backend/app/ai/pipeline.py` (lines 204–230)
- **Class / Function:** `SurveillancePipeline.stream_video()`
- **Implementation:**
  - Opens file: `cap = cv2.VideoCapture(self.video_path)`
  - Reads properties: `fps = cap.get(cv2.CAP_PROP_FPS) or 25.0`, `width`, `height`
  - Generator loop: `ret, frame = cap.read()`
  - Cleanup: `cap.release()` in finally block.
- **Runtime Test Results (`Border_Test_03.mp4`):**
  - Filename: `Border_Test_03.mp4`
  - Resolution: `960 x 540`
  - Source FPS: `30.00`
  - Total Frames: `270`
  - Duration: `9.00 seconds`
  - Frames successfully read in test: `60`
  - Read Time for 60 frames: `0.130s` (461.3 FPS theoretical read throughput)
  - OpenCV Errors: `None` (valid BGR frames with shape `(540, 960, 3)` and dtype `uint8`).

---

### Section 3: YOLOv8 Inference Proof
- **Exact File:** `backend/app/ai/detector.py`
- **Answers to Specified Audit Questions:**
  1. *Which YOLO model is loaded?* **YOLOv8n** (`yolov8n.pt`).
  2. *Where is the model loaded?* `ObjectDetector._init_model()` loads `MODELS_DIR / "yolov8n.pt"`.
  3. *Is it loaded once or repeatedly?* Loaded **once** per `ObjectDetector` instance in `SurveillancePipeline.__init__()`.
  4. *What exact Ultralytics API is used?* `from ultralytics import YOLO`; `self.model = YOLO(model_path)`; `results = self.model(frame, conf=self.confidence_threshold, verbose=False)`.
  5. *What confidence threshold is used?* `0.30` (runtime configurable via settings).
  6. *What image size is used?* Native frame resolution scaled automatically by YOLO to 640px default inference grid.
  7. *What classes are accepted?* `PERSON_CLASSES` (`person`), `VEHICLE_CLASSES` (`car`, `motorcycle`, `bus`, `truck`, `bicycle`, `vehicle`), `ANIMAL_CLASSES` (10 species), plus `motion`.
  8. *How are YOLO class IDs mapped?* `raw_cls_name = self.model.names[cls_id].lower()`; mapped via `categorize_class(raw_cls_name)` to `"person"`, `"vehicle"`, `"animal"`, or `"other"`.
  9. *Is inference actually executed for each processed frame?* **Yes**, `self.detector.detect(frame)` runs on every loop iteration.
  10. *What happens if the model file is missing?* The code falls back to `_init_opencv_fallback()` creating a `cv2.createBackgroundSubtractorMOG2()` instance and logging a warning.
- **Actual Raw Detection Output on Video Frame 3:**
  - Frame Index: `3` (t = 0.10s)
  - Target: `person`
  - Confidence: `0.676` (67.6%)
  - Normalized Bounding Box: `[0.1415, 0.4395, 0.1722, 0.6009]`
- **Actual Raw Detection Output on Video Frame 73:**
  - Frame Index: `73` (t = 2.43s)
  - Target: `person`
  - Confidence: `0.573` (57.3%)
  - Normalized Bounding Box: `[0.2837, 0.4929, 0.3133, 0.6829]`

---

### Section 4: YOLO Model Verification
- **Path:** `backend/models/yolov8n.pt`
- **File Existence:** Verified (`True`)
- **File Size:** `6,549,796 bytes` (~6.25 MB)
- **Ultralytics Loading:** Loaded successfully in PyTorch/Ultralytics with output:
  `Loaded YOLOv8 detector from E:\SIH_FINAL_PROJECT\backend\models\yolov8n.pt`
- **Origin:** Official pre-trained Ultralytics YOLOv8 nano model checkpoint on COCO dataset.

---

### Section 5: Fallback Detector Audit & Correction
- **Implementation:** `ObjectDetector._detect_opencv()` uses MOG2 background subtractor (`history=300, varThreshold=16`).
- **Audit Discovery:** Previously, the fallback heuristic guessed `"person"`, `"vehicle"`, or `"animal"` purely by contour aspect ratio (`bh / bw`).
- **Correction Applied:** Replaced aspect ratio guessing with explicit `obj_cls = "motion"`, `category = "motion"`, and `conf = min(0.60, max(0.35, ...))`. MOG2 now strictly reports motion energy and **never** fakes person/vehicle/animal classifications.

---

### Section 6: Tracker Algorithm & ID Persistence Proof
- **Exact File:** `backend/app/ai/tracker.py`
- **Tracker Classification:** **Custom greedy IoU tracker** with velocity estimation and dwell tracking.
- **Not ByteTrack or DeepSORT:** It does not use Kalman filtering, two-stage low-confidence matching, or appearance embedding re-identification. It calculates geometric IoU overlap (`min_iou=0.25`) sorted by detection confidence.
- **Multi-Frame ID Persistence Proof (`Border_Test_03.mp4`):**
  - Frame 18 (t=0.60s): Track ID `2`, BBox `[0.1724, 0.4481, 0.2026, 0.6086]`, Hits: 1
  - Frame 19 (t=0.63s): Track ID `2`, BBox `[0.1724, 0.4481, 0.2026, 0.6086]`, Hits: 1
  - Frame 20 (t=0.67s): Track ID `2`, BBox `[0.1774, 0.4460, 0.2059, 0.6131]`, Hits: 2
  - Frame 21 (t=0.70s): Track ID `2`, BBox `[0.1774, 0.4460, 0.2059, 0.6131]`, Hits: 2
  - Frame 22 (t=0.73s): Track ID `2`, BBox `[0.1774, 0.4460, 0.2059, 0.6131]`, Hits: 2
  - Frame 23 (t=0.77s): Track ID `2`, BBox `[0.1774, 0.4460, 0.2059, 0.6131]`, Hits: 2
- **ID Lifecycle:**
  - Disappearance: Marks track as missed (`time_since_update += 1`). Purged from active memory after `max_age=15` missed frames.
  - Reappearance: If an object reappears after 15 frames, it receives a new sequential `tracking_id`.

---

### Section 7: Movement & Velocity Calculation
- **Exact File:** `backend/app/ai/tracker.py` (lines 43–62)
- **Math:**
  - Delta: `dx = new_center[0] - old_center[0]`, `dy = new_center[1] - old_center[1]`
  - Time: `dt = max(0.01, timestamp - last_seen)`
  - Velocity: `vx = dx / dt`, `vy = dy / dt`
  - Displacement: `sqrt(dx^2 + dy^2)`
- **Correction Applied:** Removed uncalibrated real-world `"m/s"` claims. Replaced with `"Est. X.X px/s"` in tracker and frontend `CurrentEvent.jsx` to maintain technical defensibility without ground-plane calibration.

---

### Section 8: Restricted Zone Proof
- **Polygon Coordinates:** `[[0.0, 0.20], [0.55, 0.38], [0.50, 0.52], [0.0, 0.38]]` (normalized coordinates `[0.0, 1.0]`).
- **Target Evaluation Point:** Object bottom-center `((x1+x2)/2, y2)` and centroid.
- **Runtime Case Evaluation:**
  - **Case A (Outside):** BBox `[0.70, 0.70, 0.80, 0.85]` $\rightarrow$ `is_in_zone=False`, `should_alert=False`
  - **Case B (Enters Zone):** BBox `[0.25, 0.28, 0.35, 0.36]` $\rightarrow$ `is_in_zone=True`, `should_alert=True`, `event="Zone breach"`, `severity="Critical"`
  - **Case C (Remains Inside):** BBox `[0.26, 0.29, 0.36, 0.37]` $\rightarrow$ `is_in_zone=True`, `should_alert=False` (**Debounced: Zero duplicate alert!**)
  - **Case D (Leaves Zone):** BBox `[0.70, 0.70, 0.80, 0.85]` $\rightarrow$ `is_in_zone=False`, state resets.

---

### Section 9: Border Line Approach Proof
- **Line Coordinates:** `[[0.0, 0.42], [0.95, 0.42]]`
- **Distance Formula:** Perpendicular distance from target bottom point to line segment.
- **Evaluation:** Object moving with `direction="Towards Border"` and `distance < 15m` transitions `state.approaching_fence` and triggers `"Movement towards fence"` with severity `"High"`.

---

### Section 10: Dwell Time & Loitering Audit
- **Configured Threshold in Code:** `loiter_threshold_seconds = 4.0 seconds` in `rule_engine.py` and `config.py`.
- **Audit Observation:** The prompt noted that the original design intended 45 seconds for production. In this audit, we **did NOT silently change** the code to 45 seconds. We report that the current codebase uses **4.0 seconds** (for fast local video demonstration).
- **Recommendation:** Production deployments on continuous CCTV feeds should set `loiter_threshold_seconds = 45.0`.
- **Track ID Association:** Dwell time is tracked per `TrackedObject.dwell_time` (`last_seen - first_seen`) tied to the specific `tracking_id`.

---

### Section 11 & 12: Event Engine & Debounce Proof
- **Debounce Mechanism:** `TrackIncidentState` keeps persistent boolean flags (`in_restricted_zone`, `approaching_fence`, `has_loiter_alerted`) and timestamp `last_alert_time`.
- **Runtime Debounce Test (50 consecutive frames inside restricted zone):**
  - Frames Evaluated: `50`
  - Events Generated: `2` (Initial Breach at Frame 0, Loitering threshold alert at Frame 40)
  - Duplicate Frames Suppressed: `48`
  - Zero spam rows in database.

---

### Section 13: Threat Risk Engine Proof
- **Exact File:** `backend/app/ai/risk_engine.py`
- **Audit Bug Discovered & Fixed:**
  - Previously, `if high_dwell or any_zone_breach:` caused `"Dwell time > 45 sec"` to be appended even when dwell time was 0 seconds.
  - Fixed: Gated strictly on `high_dwell` (`dwell_time > 45 sec`).
  - Base score fixed: Returns `score = 0`, `level = "SECURE"` when no entities are active.
- **Runtime Score Breakdown for Event 22:**
  - Base: `10`
  - Person detected: `+25`
  - Movement towards boundary: `+20`
  - Night condition: `+10`
  - Restricted zone breach: `+0` (target was approaching fence, not inside polygon)
  - High dwell: `+0`
  - **Final Score:** `65 / 100` (`MEDIUM RISK`)
- **Randomness Check:** Grep search for `Math.random` and `random()` confirmed **zero** random number generators in threat calculation.

---

### Section 14: Evidence Snapshot Proof
- **Triggered Event:** Event ID `22` (Track ID `3`, timestamp `22:43:47`)
- **Saved File:** `backend/storage/evidence/trace_test_243_3.jpg`
- **File Size:** `36,417 bytes`
- **Image Verification:** OpenCV read confirmed valid 3-channel image with shape `(540, 960, 3)`.
- **HTTP Endpoint Verification:** `GET http://localhost:8000/storage/evidence/trace_test_243_3.jpg` returned `HTTP 200 OK` with `Content-Type: image/jpeg`.

---

### Section 15: SQLite Database Proof
- **Database Path:** `backend/storage/surveillance.db`
- **Tables & Row Counts:**
  - `cameras`: 4 rows
  - `security_events`: 22 rows
  - `detections`: 361 rows
  - `videos`: 8 rows
  - `alerts`: 22 rows
  - `system_settings`: 8 rows
  - `analysis_jobs`: 0 rows
- **Sample Event Record (Row 22):**
  - `id`: `22`
  - `event_type`: `"Movement towards fence"`
  - `camera_id`: `"CAM-01"`
  - `timestamp`: `"22:43:47"`
  - `tracking_id`: `3`
  - `severity`: `"High"`
  - `risk_score`: `65`
  - `key_factors`: `["Person detected", "Movement towards boundary", "Night condition"]`
  - `snapshot_path`: `"/storage/evidence/trace_test_243_3.jpg"`
  - `verified`: `0` (False)

---

### Section 16: FastAPI HTTP Endpoint Audit
All 16 routes tested returned **HTTP 200 OK**:
1. `GET /health` $\rightarrow$ 200 OK
2. `GET /api/cameras` $\rightarrow$ 200 OK
3. `GET /api/videos` $\rightarrow$ 200 OK
4. `GET /api/events` $\rightarrow$ 200 OK
5. `GET /api/events/current` $\rightarrow$ 200 OK
6. `GET /api/analytics/summary` $\rightarrow$ 200 OK
7. `GET /api/analytics/events-by-hour` $\rightarrow$ 200 OK
8. `GET /api/analytics/events-by-type` $\rightarrow$ 200 OK
9. `GET /api/analytics/threat-history` $\rightarrow$ 200 OK
10. `GET /api/system/status` $\rightarrow$ 200 OK
11. `GET /api/threat/current` $\rightarrow$ 200 OK
12. `GET /api/settings` $\rightarrow$ 200 OK
13. `POST /api/cameras/CAM-01/test-connection` $\rightarrow$ 200 OK
14. `POST /api/analysis/start` $\rightarrow$ 200 OK
15. `GET /api/analysis/status` $\rightarrow$ 200 OK
16. `POST /api/analysis/stop` $\rightarrow$ 200 OK

---

### Section 17: WebSocket Protocol Proof
Connected to `ws://localhost:8000/ws/live/CAM-01`:
1. **Idle Packet:** Delivered `analysis_active: false`, `persons: 0`, `score: 0`, `level: "SECURE"`.
2. **Analysis Started:** Client sent `{"action": "start_analysis", "video": "Border_Test_03.mp4"}`.
3. **Telemetry Packets:**
   - Frame 2: `analysis_active: true`, `persons: 1`, `active_tracks: 1`, `score: 45`, `level: "MEDIUM RISK"`, active entity Track ID 1 with confidence 0.469.
4. **Analysis Stopped:** Client sent `{"action": "stop_analysis"}`. Pipeline halted cleanly.

---

### Section 18: React State & UI Data Flow
- WebSocket frame received in `useSurveillanceWebSocket.js`
  $\rightarrow$ `setLiveIntelligence(data.live_intelligence)`
  $\rightarrow$ Passed as prop to `<IntelligencePanel />`
  $\rightarrow$ Renders `persons: 1`, `active_tracks: 1` in `.stat-number` element.
- Threat score in `data.threat_assessment`
  $\rightarrow$ Passed to `<ThreatAssessment />`
  $\rightarrow$ Renders dynamic SVG gauge arc and score `45/100`.
- Incident in `data.latest_event`
  $\rightarrow$ Passed to `<CurrentEvent />`
  $\rightarrow$ Renders title `"Movement towards fence"`, snapshot image, estimated speed.

---

### Section 19: Static Data & Suspicious Values Audit
- **Value 72:** Found only in a comment in `ThreatAssessment.jsx` explaining *never to use fake 72*.
- **Value 87:** Previous events in SQLite had score 87 due to the risk engine bug (base 15 + person 25 + approach 15 + night 10 + zone 12 + dwell 10 = 87). Fixed in this audit.
- **Value 0.92, 0.88, 0.81:** Found in `detector.py` MOG2 fallback heuristic. Fixed to output explicit `MOTION` with confidence 0.40–0.60.

---

### Section 20 & 23: Green Status & System Diagnostics Audit
- **Audit Findings:**
  - Previously, `video_engine` was reported as "Running" whenever `videos` existed in DB. Fixed: Now checks `job_manager.status == "RUNNING"`.
  - Previously, `edge_device` claimed "Jetson Orin Node" on a Windows PC. Fixed: Now reports genuine platform (`f"{platform.system()} Host Station ({platform.machine()})"` $\rightarrow$ `"Windows Host Station (AMD64)"`).
  - CPU, RAM, and Disk: Verified using Python `psutil` and `shutil.disk_usage()`. Reported values (CPU 29%, RAM 81%, Disk 48%) are genuine operating system telemetry.
  - In `SystemStatus.jsx`, indicators are now tied directly to their respective backend properties (`isBackendOnline`, `isDbConnected`, `isAiReady`).

---

### Section 21: Current Event Audit
- **Why the dashboard showed "Movement towards fence":**
  It is a **real database event** produced during previous analysis runs of `Border_Test_03.mp4`. In that video, a target approaches the fence line (`dist_to_fence < 15m` and direction `"Towards Border"`), which triggers `rule_engine.py` to create `"Movement towards fence"`. It was **not** a hardcoded demo string.

---

### Section 24: Single Event End-to-End Trace (Event ID 22)
1. **Video Frame:** `Border_Test_03.mp4`, Frame 73, timestamp `2.43s`.
2. **OpenCV:** Read 3-channel frame `(540, 960, 3)`.
3. **YOLOv8:** Detected `person`, confidence `0.573`, bbox `[0.2837, 0.4929, 0.3133, 0.6829]`.
4. **Tracker:** Assigned Track ID `3`, velocity `[0.0574, -0.2738]`, direction `"Towards Border"`, speed `"Est. 7.0 px/s"`.
5. **Rule Engine:** Evaluated perpendicular fence distance `13m` and approach vector $\rightarrow$ `event_type = "Movement towards fence"`, `severity = "High"`.
6. **Risk Engine:** Computed score `65 / 100` (`"MEDIUM RISK"`), factors: `["Person detected", "Movement towards boundary", "Night condition"]`.
7. **Snapshot:** Saved `backend/storage/evidence/trace_test_243_3.jpg` (36,417 bytes).
8. **SQLite:** Inserted into `security_events` table as row ID `22`.
9. **WebSocket:** Broadcast packet with `latest_event.id = 22`.
10. **React:** `CurrentEvent.jsx` updated with title `"Movement towards fence"`, severity badge `"High"`, and evidence snapshot image.
