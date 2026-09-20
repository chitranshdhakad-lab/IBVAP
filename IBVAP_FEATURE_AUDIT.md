# IBVAP — Intelligent Border Video Analysis Platform
## Complete Feature Audit & Technical Realism Matrix

**Generated At:** September 2026  
**Scope:** Command-Center Surveillance System (`http://localhost:5173`)  
**Architecture:** React Frontend + FastAPI Backend + SQLite Storage + YOLOv8/CV Pipeline  

---

### Realistic Feature Classification Framework

Every audited feature is categorized into one of four operational categories:
1. **IMPLEMENT NOW**: Locally viable immediately using available code, real SQLite models, FastAPI routes, and local CV/YOLOv8 processing.
2. **PARTIALLY IMPLEMENT NOW**: Core functionality implemented with real architecture; non-hardware simulated or configured realistically (e.g. static aerial base map with dynamic tactical pin overlays).
3. **FUTURE HARDWARE / EXTERNAL DEPENDENCY**: Depends on external physical systems (e.g. physical RTSP IP cameras, ONVIF discovery, satellite downlink, live GPS receivers); architecture prepared cleanly without faking live data.
4. **NOT CURRENTLY JUSTIFIABLE**: Unsubstantiated or high-risk features for local deployment (e.g. uncalibrated face recognition without training datasets, cloud telemetry when running air-gapped).

---

### Detailed Feature Audit (Items A through U)

| # | Feature | Current State | Backend Required | Frontend Required | Database Required | Realistically Implementable Now? | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **A** | **Header** | Functional branding, clock, status indicator, patriot badge. Minor layout overlap at smaller widths. | None for clock; `/api/system/status` for connection pill. | Responsive layout zones (LEFT, CENTER, RIGHT) with `minmax(0, 1fr)` flex/grid. No absolute collisions. | None | Yes | **IMPLEMENT NOW** | Remove absolute positioning on center slogan. Keep background mountain art non-blocking. Ensure 1280px-1920px responsiveness. |
| **B** | **Live Monitor** | Video player displaying local MP4 with SVG bounding box overlay. | `/api/cameras`, `/api/videos`, `/ws/live/{camera_id}` for telemetry. | Real HTML5 `<video>` tag, synchronized controls, dynamic overlay mode toggle. | `videos`, `cameras` | Yes | **IMPLEMENT NOW** | Never use static JPEG as feed. Video element must play, seek, pause, and mute. |
| **C** | **Video Library** | Basic list view in dashboard sidebar section. | `GET /api/videos`, `POST /api/videos/upload`, `GET /api/videos/{id}`. | Full video library module: card/table view, metadata display (FPS, duration, resolution), play/analyze triggers. | `videos` table in SQLite | Yes | **IMPLEMENT NOW** | Synchronized with disk storage (`backend/storage/videos/` and `public/videos/`). |
| **D** | **Events & Alerts** | Basic table in modal and tab. Some demo values existed previously. | `GET /api/events`, `GET /api/events/{id}`, `GET /api/alerts`. | Dedicated audit view with severity filter tabs (All, Critical, High, Medium, Low) and event verification buttons. | `security_events`, `alerts` in SQLite | Yes | **IMPLEMENT NOW** | Queried dynamically from SQLite. Newest first. No fake rows. |
| **E** | **Border Map** | Static image in right panel and modal with basic HUD pin overlay. | `/api/cameras` for registered station coordinates. | Map view showing camera sector pins, border perimeter line, and exclusion polygon. Satellite vs Tactical toggle. | `cameras` table | Yes | **PARTIALLY IMPLEMENT NOW** | Label map base clearly as tactical orthophoto / configured sector map; dynamic station pins and status. No fake live GPS claim. |
| **F** | **Analytics** | Static card counters in tab. | `GET /api/analytics/summary`, `GET /api/analytics/events`. | Comprehensive analytics dashboard computing totals, severity breakdown, and object distribution from SQLite. | Aggregated queries on `security_events` & `detections` | Yes | **IMPLEMENT NOW** | Display "No data available" if database has no events, rather than manufactured charts. |
| **G** | **Camera Management** | Basic list displaying CAM-01 through CAM-04. | `GET /api/cameras`, `POST /api/cameras`, `PATCH /api/cameras/{id}`. | Station list with name, sector, source type (FILE/RTSP), status badge, and configuration options. | `cameras` table in SQLite | Yes | **IMPLEMENT NOW** | Allow switching cameras and toggling active video files. RTSP connection testing only when RTSP URL supplied. |
| **H** | **System Status** | Cards and modal displaying hardware and service telemetry. | `GET /api/system/status` using `psutil` or N/A fallbacks. | Telemetry gauges/rows for Backend, Database, AI Engine, Video Processor, and WebSocket. | `surveillance.db` integrity check | Yes | **IMPLEMENT NOW** | No fake 48% CPU or 54°C. Display real `psutil` readings if available, else clean "N/A" with operational status. |
| **I** | **Settings** | Basic sliders without persistence. | `GET /api/settings`, `POST /api/settings` (or config persistence). | Operational parameter controls: YOLO confidence (0.1-0.9), Loiter threshold (s), Cooldown debounce (s), and Risk weights. | Settings JSON / Config table | Yes | **IMPLEMENT NOW** | Real state updates stored and applied to active CV pipeline. |
| **J** | **Video Controls** | HTML5 video controls bar (Play, Seek, Volume, Speed, Fullscreen). | Video streaming or static MP4 asset serving. | Play/Pause toggle, real current time / duration from video metadata, seekable progress bar, volume toggle, 0.5x-2x speed cycle. | None | Yes | **IMPLEMENT NOW** | Duration must strictly match the loaded video file (no hardcoded `03:21`). |
| **K** | **Analysis Controls** | "Analysis / Original" segmented toggle + "Start/Stop Analysis" button. | `POST /api/videos/{id}/analyze`, `POST /api/videos/{id}/stop`, WS commands. | Toggle switches between clean video and SVG bounding box overlay. Button triggers backend CV loop. | `videos.processing_status` | Yes | **IMPLEMENT NOW** | State must reflect actual backend pipeline activity. Red badge when active, idle indicator when stopped. |
| **L** | **Intelligence Counters** | Displayed Persons, Vehicles, Animals, Active Tracks. | WebSocket packet `live_intelligence`. | Dynamic counter cards with real values from IoU tracker. Displays 0 when inactive. | `detections` table | Yes | **IMPLEMENT NOW** | Eliminate hardcoded 4, 2, 1, 7. Zero when analysis stopped; real integers when detecting. |
| **M** | **Threat Assessment** | Circular SVG gauge and factor list. Previously hardcoded 72. | Computed dynamically by `ThreatRiskEngine` based on zone breach, dwell, entity count. | Dynamic gauge rendering backend score (0-100), severity color (Green, Amber, Red), and key factors. | `security_events.risk_score` | Yes | **IMPLEMENT NOW** | Transparent deterministic scoring rule: $Score = W_z \cdot Zone + W_d \cdot Dwell + W_c \cdot Count$. Configurable weights. |
| **N** | **Event Timeline** | Horizontal scrubber with snapshot thumbnails. | WebSocket timestamp and evidence snapshot URLs. | Timeline bar with event markers corresponding to actual detections, clickable snapshots linking to clip viewer. | `security_events` | Yes | **IMPLEMENT NOW** | Scrubber follows real video playback. Snapshots link to real saved frame crops. |
| **O** | **Current Event** | Panel showing intruder details. Previously showed hardcoded intruder 17. | `GET /api/events/current` or latest WebSocket event. | Displays actual latest event, camera, object, track ID, confidence, and snapshot. Shows "No active event" if empty. | `security_events` | Yes | **IMPLEMENT NOW** | Replace static placeholder with real event card or empty state placeholder. |
| **P** | **Notifications** | Bell icon in header with badge. Previously hardcoded 3. | Unverified critical/high events count from SQLite. | Bell icon with dynamic badge count equal to unverified events. Dropdown alert tray with click-to-view. | `alerts`, `security_events` | Yes | **IMPLEMENT NOW** | Badge decrements dynamically when operator verifies events. |
| **Q** | **Upload** | "Upload Videos" button and file picker. | `POST /api/videos/upload` handling multipart MP4 files. | File picker dialog, upload progress indicator, automatic metadata extraction, and library addition. | `videos` table | Yes | **IMPLEMENT NOW** | Copies video to both backend storage and frontend public folder for immediate playback. |
| **R** | **Verification** | "Mark as Verified" button on current event and event tables. | `PATCH /api/events/{id}/verify`. | Button updates to "Verified by Operator", persists immediately to SQLite, persists across page reload. | `security_events.verified`, `verified_at` | Yes | **IMPLEMENT NOW** | Real DB update with timestamp and operator audit log. |
| **S** | **Fullscreen** | Fullscreen button on video bar and control bar. | None | Browser Fullscreen API (`element.requestFullscreen()`) on video container. | None | Yes | **IMPLEMENT NOW** | Tested and functional across modern desktop browsers. |
| **T** | **Map/Satellite View** | View switcher button on map card. | None | Toggles between Tactical Geofence Map and Aerial Orthophoto mode. Clear labels indicating static orthophoto. | None | Yes | **IMPLEMENT NOW** | Clear labelling: "Tactical Sector Grid" and "Orthophoto Satellite Reference". |
| **U** | **System Health API** | FastAPI health route. | `GET /api/health` returning operational status of DB, AI, and storage. | Status pill in header and system status panel reflecting true connectivity. | SQLite connection verification | Yes | **IMPLEMENT NOW** | Automatically detects backend disconnect and switches UI to "Backend Offline" mode. |

---

### Hardware & Future Dependency Strategy

1. **RTSP Live Cameras**:
   - The camera schema supports `source_type: "FILE" | "RTSP"`. When local files are loaded, file ingestion runs. If an RTSP URL is provided and accessible, OpenCV `cv2.VideoCapture(rtsp_url)` will be connected. No fake RTSP feeds are manufactured.
2. **Satellite Live Imagery**:
   - Satellite base imagery is labeled as "Calibrated Orthophoto (GeoTIFF Reference)". It provides tactical spatial reference without claiming live orbital video.
3. **Identity / Face Recognition**:
   - Strictly disabled. Object detection classifies into physical tactical classes: `person`, `vehicle`, `animal`. No unverified facial recognition claims are made.
4. **GPS Border Accuracy**:
   - Perimeter polygons and border lines use calibrated normalized sensor-plane coordinates ($[0.0 \dots 1.0]$) mapped to known BOP station coordinates.
