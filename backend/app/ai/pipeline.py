import os
import time
import datetime
import logging
from typing import Dict, Any, Optional, Generator, List
from pathlib import Path
import cv2
import numpy as np

from app.config import settings, EVIDENCE_DIR, PROJECT_ROOT
from app.database import SessionLocal
from app.models import SecurityEvent, Alert, Detection as DetectionModel, Snapshot, Track
from app.ai.detector import ObjectDetector, FaceDetector, PERSON_CLASSES, VEHICLE_CLASSES, ANIMAL_CLASSES, ALLOWED_SURVEILLANCE_CLASSES
from app.ai.tracker import MultiObjectTracker
from app.ai.rule_engine import TacticalRuleEngine
from app.ai.risk_engine import ThreatRiskEngine
from app.ai.anpr_engine import get_anpr_engine
from app.routers.settings import get_active_runtime_settings

logger = logging.getLogger("surveillance.ai.pipeline")

from concurrent.futures import ThreadPoolExecutor
_anpr_executor = ThreadPoolExecutor(max_workers=1)
_anpr_inflight_tracks = set()

# In-memory stream buffer for live MJPEG streaming
_latest_stream_frames: Dict[str, bytes] = {}

def update_stream_frame(camera_id: str, frame_bytes: bytes):
    _latest_stream_frames[camera_id] = frame_bytes

def get_latest_stream_frame(camera_id: str) -> Optional[bytes]:
    return _latest_stream_frames.get(camera_id)

class SurveillancePipeline:
    def __init__(
        self,
        camera_id: str = "CAM-01",
        video_path: Optional[str] = None,
        video_id: Optional[int] = None,
        restricted_zone: Optional[list] = None,
        border_line: Optional[list] = None
    ):
        self.camera_id = camera_id
        self.video_path = video_path
        self.video_id = video_id
        # Tactical boundary corridor coordinates in CAM-01 view
        self.restricted_zone = restricted_zone or [
            [0.0, 0.22], [1.0, 0.22], [1.0, 0.65], [0.0, 0.65]
        ]
        self.border_line = border_line or [
            [0.0, 0.42], [1.0, 0.42]
        ]

        conf = getattr(settings, 'YOLO_CONFIDENCE_THRESHOLD', 0.25)
        debounce = getattr(settings, 'DEFAULT_DEBOUNCE_SECONDS', 3.0)
        loiter = getattr(settings, 'LOITERING_THRESHOLD_SECONDS', 4.0)

        fps_est = 25.0
        if self.video_path and os.path.exists(self.video_path):
            try:
                c_tmp = cv2.VideoCapture(self.video_path)
                fps_est = float(c_tmp.get(cv2.CAP_PROP_FPS) or 25.0)
                c_tmp.release()
            except Exception:
                pass

        self.detector = ObjectDetector(confidence_threshold=conf)
        self.tracker = MultiObjectTracker(max_age=max(25, int(fps_est * 1.2)), min_iou=0.20, max_center_dist=0.12)
        self.rule_engine = TacticalRuleEngine(debounce_seconds=debounce, loiter_threshold_seconds=loiter)
        self.risk_engine = ThreatRiskEngine()
        # Face detector (Haar Cascade) from reference project
        self.face_detector = FaceDetector()
        # Tactical ANPR Engine
        self.anpr_engine = get_anpr_engine()
        self.vehicle_anpr_cache: Dict[int, Dict[str, Any]] = {}
        self.is_running = False

        self.total_frames = 0
        self.fps = 25.0
        if self.video_path and os.path.exists(self.video_path):
            cap_meta = cv2.VideoCapture(self.video_path)
            if cap_meta.isOpened():
                self.fps = float(cap_meta.get(cv2.CAP_PROP_FPS) or 25.0)
                self.total_frames = int(cap_meta.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                # Generate initial preview frame with tactical overlay
                ret_p, frame_p = cap_meta.read()
                if ret_p:
                    ann_p = self.draw_annotations(frame_p, [], 0.0)
                    ret_j, buf_j = cv2.imencode('.jpg', ann_p, [cv2.IMWRITE_JPEG_QUALITY, 75])
                    if ret_j:
                        update_stream_frame(self.camera_id, buf_j.tobytes())
                cap_meta.release()

    def draw_annotations(
        self,
        frame: np.ndarray,
        tracked_detections: List[Dict[str, Any]],
        video_timestamp: float
    ) -> np.ndarray:
        h, w = frame.shape[:2]
        active_cfg = get_active_runtime_settings()

        # 0. Night Mode Enhancement
        if active_cfg.get("night_mode_enhancement", False):
            frame[:, :, 0] = (frame[:, :, 0] * 0.35).astype(np.uint8)
            frame[:, :, 2] = (frame[:, :, 2] * 0.35).astype(np.uint8)
            frame[:, :, 1] = np.clip(frame[:, :, 1] * 1.35, 0, 255).astype(np.uint8)

        # 1. Restricted Zone Polygon
        if self.restricted_zone and active_cfg.get("restricted_zone_enabled", True):
            pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in self.restricted_zone], np.int32)
            overlay = frame.copy()
            cv2.fillPoly(overlay, [pts], (30, 30, 220)) # Translucent red in BGR
            cv2.addWeighted(overlay, 0.20, frame, 0.80, 0, frame)
            cv2.polylines(frame, [pts], True, (40, 40, 235), 2)
            cv2.putText(frame, "RESTRICTED ZONE", (pts[0][0] + 8, pts[0][1] + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (40, 40, 255), 2)

        # 2. Border Line (IB)
        if self.border_line and active_cfg.get("border_line_enabled", True):
            bl_p1 = (int(self.border_line[0][0] * w), int(self.border_line[0][1] * h))
            bl_p2 = (int(self.border_line[1][0] * w), int(self.border_line[1][1] * h))
            cv2.line(frame, bl_p1, bl_p2, (34, 197, 94), 2) # Green in BGR
            cv2.putText(frame, "BORDER LINE (IB)", (max(10, bl_p2[0] - 180), bl_p2[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (34, 197, 94), 2)

        # 3. Tracked Objects (STRICTLY RESPECT show_detection_boxes setting)
        if active_cfg.get("show_detection_boxes", True):
            for det in tracked_detections:
                cat = det.get("category", "person")
                cls_raw = det.get("class", "person").lower()

                # Strictly suppress drawing for disabled detection categories
                if (cat == "person" or cls_raw == "person") and not active_cfg.get("person_detection", True):
                    continue
                if (cat == "vehicle" or cls_raw in VEHICLE_CLASSES) and not active_cfg.get("vehicle_detection", True):
                    continue
                if (cat == "animal" or cls_raw in ANIMAL_CLASSES) and not active_cfg.get("animal_detection", True):
                    continue

                tid = det.get("tracking_id", 1)
                cls_name = det.get("class", "person").upper()
                cat = det.get("category", "person")
                conf = int(det.get("confidence", 0.8) * 100)
                dir_str = det.get("direction", "Stationary")
                speed_str = det.get("speed", "Est. 0.0 px/s")

                bbox = det.get("bbox", (0, 0, 0, 0))
                x1 = int(bbox[0] * w)
                y1 = int(bbox[1] * h)
                x2 = int(bbox[2] * w)
                y2 = int(bbox[3] * h)

                # Color coding: Person = Red, Vehicle = Green, Animal = Amber
                if cat == "person":
                    color = (38, 38, 230)  # Red for person
                elif cat == "vehicle":
                    color = (34, 197, 94)  # Green for vehicle
                else:
                    color = (20, 150, 220)  # Amber for animal

                # Bounding Box
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Label Badge (STRICTLY RESPECT show_confidence_score setting)
                if active_cfg.get("show_confidence_score", True):
                    label = f"{cls_name} ID:{tid} ({conf}%)"
                else:
                    label = f"{cls_name} ID:{tid}"

                (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(frame, (x1, max(0, y1 - 22)), (x1 + lw + 8, y1), color, -1)
                cv2.putText(frame, label, (x1 + 4, max(12, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

                # Movement sub-badge
                sub_label = f"{dir_str} | {speed_str}"
                (sw, sh), _ = cv2.getTextSize(sub_label, cv2.FONT_HERSHEY_SIMPLEX, 0.38, 1)
                cv2.rectangle(frame, (x1, y2), (x1 + sw + 6, y2 + 18), (20, 24, 20), -1)
                cv2.putText(frame, sub_label, (x1 + 3, y2 + 13), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (220, 220, 220), 1, cv2.LINE_AA)

                # Tactical ANPR License Plate Badge (if detected)
                if det.get("anpr_plate"):
                    plate_data = det["anpr_plate"]
                    plate_str = plate_data.get("plate_number", "")
                    plate_status = plate_data.get("status", "NORMAL")
                    is_hotlist = plate_status.startswith("FLAGGED") or plate_status == "STOLEN"

                    plate_label = f"IND {plate_str}"
                    (pw, ph), _ = cv2.getTextSize(plate_label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
                    plate_bg = (0, 0, 180) if is_hotlist else (245, 245, 245)
                    plate_fg = (255, 255, 255) if is_hotlist else (15, 15, 15)

                    py_start = y2 + 20
                    py_end = py_start + 18
                    cv2.rectangle(frame, (x1, py_start), (x1 + pw + 22, py_end), plate_bg, -1)
                    cv2.rectangle(frame, (x1, py_start), (x1 + pw + 22, py_end), (30, 30, 30), 1)
                    # Blue IND stripe
                    cv2.rectangle(frame, (x1, py_start), (x1 + 14, py_end), (160, 40, 10), -1)
                    cv2.putText(frame, plate_label, (x1 + 18, py_end - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.40, plate_fg, 1, cv2.LINE_AA)

                    if is_hotlist:
                        cv2.putText(frame, f"WATCHLIST: {plate_status}", (x1, max(14, y1 - 25)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 2, cv2.LINE_AA)

                # Trajectory Trail
                history = det.get("history", [])
                if len(history) > 1:
                    for h_i in range(1, len(history)):
                        pt_a = (int(history[h_i - 1][0] * w), int(history[h_i - 1][1] * h))
                        pt_b = (int(history[h_i][0] * w), int(history[h_i][1] * h))
                        cv2.line(frame, pt_a, pt_b, (0, 220, 255), 2)

        # 3b. Face Detection Overlay (Haar Cascade — Reference Project Feature)
        if active_cfg.get("face_detection", False):
            try:
                faces = self.face_detector.detect_faces(frame)
                for face in faces:
                    fb = face.get("bbox", (0, 0, 0, 0))
                    fx1 = int(fb[0] * w)
                    fy1 = int(fb[1] * h)
                    fx2 = int(fb[2] * w)
                    fy2 = int(fb[3] * h)
                    # Cyan bounding box for faces (Haar Cascade style)
                    cv2.rectangle(frame, (fx1, fy1), (fx2, fy2), (255, 220, 0), 2)
                    cv2.putText(frame, "FACE", (fx1, max(12, fy1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 220, 0), 1, cv2.LINE_AA)
            except Exception as fe:
                pass

        # 4. HUD Banner (STRICTLY RESPECT show_timestamps setting)
        if active_cfg.get("show_timestamps", True):
            cv2.putText(frame, f"AI SURVEILLANCE FEED | {self.camera_id} | ByteTrack + YOLOv8", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            mins = int(video_timestamp // 60)
            secs = int(video_timestamp % 60)
            cv2.putText(frame, f"TIME: {mins:02d}:{secs:02d} | ACTIVE TARGETS: {len(tracked_detections)}", (15, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (34, 197, 94), 1, cv2.LINE_AA)

        return frame

    def process_frame(self, frame: np.ndarray, frame_idx: int, video_timestamp: float) -> Dict[str, Any]:
        h, w = frame.shape[:2]
        active_cfg = get_active_runtime_settings()

        # Update dynamic YOLO confidence threshold from active settings
        if "yolo_confidence_threshold" in active_cfg:
            try:
                self.detector.confidence_threshold = float(active_cfg["yolo_confidence_threshold"])
            except Exception:
                pass

        # Build allowed classes dynamically based on active AI Model settings
        allowed_classes = set()
        if active_cfg.get("person_detection", True):
            allowed_classes.update(PERSON_CLASSES)
        if active_cfg.get("vehicle_detection", True):
            allowed_classes.update(VEHICLE_CLASSES)
        if active_cfg.get("animal_detection", True):
            allowed_classes.update(ANIMAL_CLASSES)
        if not allowed_classes:
            allowed_classes = set(ALLOWED_SURVEILLANCE_CLASSES)

        # 1. YOLOv8 Pure Neural Detection (strictly real person, vehicle, and animal)
        t_infer_0 = time.time()
        raw_detections = self.detector.detect(frame, allowed_classes=list(allowed_classes))
        infer_ms = (time.time() - t_infer_0) * 1000.0

        for r_det in raw_detections:
            logger.debug(f"YOLO: class={r_det.get('class')} confidence={r_det.get('confidence')} bbox={r_det.get('bbox')}")

        # 2. Update Movement History, Speeds, and Trajectories via per-pipeline MultiObjectTracker
        raw_tracked_detections = self.tracker.update(raw_detections, current_timestamp=video_timestamp)

        # Purge any deactivated categories from internal tracker memory so they never linger
        if not active_cfg.get("person_detection", True):
            self.tracker.tracks = {tid: t for tid, t in self.tracker.tracks.items() if t.category != "person" and t.object_class.lower() != "person"}
        if not active_cfg.get("vehicle_detection", True):
            self.tracker.tracks = {tid: t for tid, t in self.tracker.tracks.items() if t.category != "vehicle" and t.object_class.lower() not in VEHICLE_CLASSES}
        if not active_cfg.get("animal_detection", True):
            self.tracker.tracks = {tid: t for tid, t in self.tracker.tracks.items() if t.category != "animal" and t.object_class.lower() not in ANIMAL_CLASSES}

        # Strictly filter detections and active entities according to settings
        tracked_detections = []
        for det in raw_tracked_detections:
            cat = det.get("category", "person")
            raw_c = det.get("class", "").lower()
            if (cat == "person" or raw_c == "person") and not active_cfg.get("person_detection", True):
                continue
            if (cat == "vehicle" or raw_c in VEHICLE_CLASSES) and not active_cfg.get("vehicle_detection", True):
                continue
            if (cat == "animal" or raw_c in ANIMAL_CLASSES) and not active_cfg.get("animal_detection", True):
                continue
            if cat not in ["person", "vehicle", "animal"] and raw_c not in ALLOWED_SURVEILLANCE_CLASSES:
                continue
            tracked_detections.append(det)

        active_entities = [
            e for e in self.tracker.get_active_entities()
            if ((e.get("category") == "person" or e.get("class", "").lower() == "person") and active_cfg.get("person_detection", True)) or
               ((e.get("category") == "vehicle" or e.get("class", "").lower() in VEHICLE_CLASSES) and active_cfg.get("vehicle_detection", True)) or
               ((e.get("category") == "animal" or e.get("class", "").lower() in ANIMAL_CLASSES) and active_cfg.get("animal_detection", True))
        ]
        counts = {
            "persons": sum(1 for e in active_entities if e.get("category") == "person" or e.get("class", "").lower() == "person") if active_cfg.get("person_detection", True) else 0,
            "vehicles": sum(1 for e in active_entities if e.get("category") == "vehicle" or e.get("class", "").lower() in VEHICLE_CLASSES) if active_cfg.get("vehicle_detection", True) else 0,
            "animals": sum(1 for e in active_entities if e.get("category") == "animal" or e.get("class", "").lower() in ANIMAL_CLASSES) if active_cfg.get("animal_detection", True) else 0,
            "active_tracks": len(active_entities)
        }

        # Purge tracking states for departed objects in rule engine
        self.rule_engine.cleanup_expired_tracks([e["tracking_id"] for e in active_entities if "tracking_id" in e])

        # 3. Rule Engine & Security Events
        any_zone_breach = False
        any_border_crossing = False
        min_fence_dist = 999.0
        active_events = []
        latest_event = None

        # Real environmental night condition evaluation
        frame_mean_lum = float(np.mean(frame)) if (frame is not None and frame.size > 0) else 128.0
        current_hour = datetime.datetime.now().hour
        is_night = bool(
            active_cfg.get("night_mode_enhancement", False) or
            frame_mean_lum < 55.0 or
            (current_hour >= 19 or current_hour < 6)
        )

        db = SessionLocal()
        try:
            for det in tracked_detections:
                tid = det.get("tracking_id", 0)
                cls_name = det.get("class", "person")
                cat_name = det.get("category", "person")
                bbox = det.get("bbox", (0, 0, 0, 0))
                dir_str = det.get("direction", "Stationary")
                dwell_sec = float(str(det.get("dwell_time", "0")).split()[0])

                rule_res = self.rule_engine.evaluate(
                    tracking_id=tid,
                    bbox=bbox,
                    previous_bbox=det.get("previous_bbox"),
                    video_timestamp=video_timestamp,
                    restricted_zone=self.restricted_zone,
                    border_line=self.border_line,
                    object_class=cls_name,
                    category=cat_name,
                    direction_str=dir_str,
                    dwell_seconds=dwell_sec
                )

                det["is_in_restricted_zone"] = rule_res["is_in_restricted_zone"]
                det["distance_to_fence"] = rule_res["distance_to_fence"]
                det["distance_meters"] = rule_res.get("distance_meters", 999.0)
                det["crossed_border"] = rule_res.get("crossed_border", False)

                if rule_res["is_in_restricted_zone"] and active_cfg.get("restricted_zone_enabled", True):
                    any_zone_breach = True
                if rule_res.get("crossed_border", False) and active_cfg.get("border_line_enabled", True):
                    any_border_crossing = True
                if rule_res.get("distance_meters", 999.0) < min_fence_dist:
                    min_fence_dist = rule_res.get("distance_meters", 999.0)

                # Record detection to DB (no silent dropping)
                if active_cfg.get("store_detections", True):
                    d_model = DetectionModel(
                        video_id=self.video_id,
                        camera_id=self.camera_id,
                        frame_number=frame_idx,
                        timestamp=round(video_timestamp, 3),
                        tracking_id=tid,
                        object_class=cls_name,
                        category=cat_name,
                        confidence=round(float(det.get("confidence", 0.0)), 3),
                        bbox=list(bbox)
                    )
                    db.add(d_model)

                # Persist persistent track lifecycle and trajectory to tracks table
                t_obj = self.tracker.tracks.get(tid)
                if t_obj:
                    spd = round(float(getattr(t_obj, "speed_mps", 0.0)), 1)
                    track_q = db.query(Track).filter(Track.camera_id == self.camera_id, Track.track_id == tid)
                    if self.video_id is not None:
                        track_q = track_q.filter(Track.video_id == self.video_id)
                    else:
                        track_q = track_q.filter(Track.video_id.is_(None))
                    t_rec = track_q.first()
                    if not t_rec:
                        t_rec = Track(
                            video_id=self.video_id,
                            camera_id=self.camera_id,
                            track_id=tid,
                            object_class=cls_name,
                            category=cat_name,
                            first_seen_frame=frame_idx,
                            last_seen_frame=frame_idx,
                            first_seen_time=video_timestamp,
                            last_seen_time=video_timestamp,
                            avg_speed=spd,
                            trajectory=list(t_obj.history)
                        )
                        db.add(t_rec)
                    elif frame_idx % 10 == 0:
                        t_rec.last_seen_frame = frame_idx
                        t_rec.last_seen_time = video_timestamp
                        t_rec.avg_speed = spd
                        t_rec.trajectory = list(t_obj.history)

                # 3c. Automated License Plate Recognition (ANPR) on Vehicles (Asynchronous, Zero-Lag)
                if (cat_name == "vehicle" or cls_name.lower() in VEHICLE_CLASSES) and active_cfg.get("anpr_enabled", True):
                    if tid not in self.vehicle_anpr_cache and tid not in _anpr_inflight_tracks:
                        _anpr_inflight_tracks.add(tid)
                        def _bg_anpr_task(f_crop, d_copy, c_id, v_id, v_ts, t_id):
                            try:
                                s_anpr = SessionLocal()
                                try:
                                    res = self.anpr_engine.process_vehicle_detection(
                                        frame=f_crop,
                                        vehicle_det=d_copy,
                                        camera_id=c_id,
                                        video_id=v_id,
                                        video_timestamp=v_ts,
                                        db_session=s_anpr
                                    )
                                    if res:
                                        self.vehicle_anpr_cache[t_id] = res
                                finally:
                                    s_anpr.close()
                            except Exception as anpr_err:
                                logger.debug(f"Async ANPR error: {anpr_err}")
                            finally:
                                _anpr_inflight_tracks.discard(t_id)

                        _anpr_executor.submit(
                            _bg_anpr_task,
                            frame.copy(),
                            dict(det),
                            self.camera_id,
                            self.video_id,
                            video_timestamp,
                            tid
                        )

                    if tid in self.vehicle_anpr_cache:
                        det["anpr_plate"] = self.vehicle_anpr_cache[tid]

                # Triggered Security Event with Alert Settings verification
                if rule_res["should_alert"] and rule_res["event_type"]:
                    evt = rule_res["event_type"]

                    # Handle incident resolution on zone exit
                    if rule_res.get("is_exit_event"):
                        try:
                            open_alert = db.query(Alert).filter(
                                Alert.camera_id == self.camera_id,
                                Alert.status == "ACTIVE",
                                Alert.title.contains(f"Track ID {tid}")
                            ).order_by(Alert.id.desc()).first()
                            if open_alert:
                                open_alert.status = "RESOLVED"
                                db.commit()
                        except Exception:
                            pass

                    # If person detection is disabled, strictly suppress all person alerts
                    if (cat_name == "person" or cls_name == "person") and not active_cfg.get("person_detection", True):
                        rule_res["should_alert"] = False
                    # Intrusion alert toggle check
                    elif ("ZONE_BREACH" in evt or "RESTRICTED" in evt or "Zone breach" in evt) and not active_cfg.get("intrusion_alerts", True):
                        rule_res["should_alert"] = False
                    # Cross-border alert toggle check
                    elif ("BORDER_CROSSING" in evt or "Border crossing" in evt or "FENCE_APPROACH" in evt or "fence" in evt.lower() or "border" in evt.lower()) and not active_cfg.get("cross_border_alerts", True):
                        rule_res["should_alert"] = False
                    # Animal alert toggle check
                    elif (cat_name == "animal" or cls_name in ANIMAL_CLASSES) and not active_cfg.get("animal_alerts", True):
                        rule_res["should_alert"] = False
                    # Vehicle alert toggle check
                    elif (cat_name == "vehicle" or cls_name in VEHICLE_CLASSES) and not active_cfg.get("vehicle_alerts", True):
                        rule_res["should_alert"] = False

                if rule_res["should_alert"] and rule_res["event_type"]:
                    event_time_str = datetime.datetime.now().strftime("%H:%M:%S")

                    threat_calc = self.risk_engine.compute_threat(
                        active_entities=active_entities,
                        any_zone_breach=rule_res["is_in_restricted_zone"] or any_zone_breach,
                        any_border_crossing=rule_res.get("crossed_border", False) or any_border_crossing,
                        min_fence_dist=min(min_fence_dist, rule_res.get("distance_meters", 999.0)) if min_fence_dist < 999.0 else None,
                        is_night=is_night
                    )

                    active_events.append({
                        "event_type": rule_res["event_type"],
                        "severity": rule_res["severity"],
                        "track_id": tid
                    })

                    conf_float = round(float(det.get("confidence", 0.0)), 3)
                    conf_str = f"{int(conf_float * 100)}%"

                    # 1. First stage: Initialize SecurityEvent to allocate authoritative database ID
                    sec_event = SecurityEvent(
                        event_type=rule_res["event_type"],
                        camera_id=self.camera_id,
                        video_id=self.video_id,
                        timestamp=event_time_str,
                        video_timestamp=round(video_timestamp, 3),
                        tracking_id=tid,
                        object_class=cls_name,
                        category=cat_name,
                        severity=rule_res["severity"],
                        risk_score=threat_calc["score"],
                        key_factors=threat_calc["key_factors"],
                        details={
                            "confidence": conf_str,
                            "confidence_score": conf_float,
                            "speed": det.get("speed", "Est. 0.0 px/s"),
                            "direction": dir_str,
                            "dwell_time": det.get("dwell_time", "0 sec"),
                            "distance": rule_res["distance_to_fence"],
                            "bbox": list(bbox),
                            "frame_number": frame_idx,
                            "video_id": self.video_id
                        },
                        verified=False
                    )
                    db.add(sec_event)
                    db.flush()  # Allocates sec_event.id atomically within current transaction
                    evt_id = sec_event.id

                    # 2. Canonical evidence filenames linking Camera, Video, Event ID, Frame, and Track ID
                    vid_tag = f"vid{self.video_id}" if self.video_id else "live"
                    snap_filename = f"evidence_{self.camera_id}_{vid_tag}_evt{evt_id}_f{frame_idx}_t{tid}.jpg"
                    snap_path = EVIDENCE_DIR / snap_filename
                    crop_filename = f"crop_{snap_filename}"
                    crop_path = EVIDENCE_DIR / crop_filename

                    # 3. Render tactical annotated frame directly from current decoded frame
                    snap_annotated = self.draw_annotations(frame.copy(), tracked_detections, video_timestamp)
                    
                    # Overlay Tactical C4ISR Evidence Banner with exact Event ID, Frame, and Timestamps
                    header_bg = snap_annotated.copy()
                    cv2.rectangle(header_bg, (0, 0), (w, 36), (12, 16, 24), -1)
                    cv2.addWeighted(header_bg, 0.85, snap_annotated, 0.15, 0, snap_annotated)
                    
                    banner_text = (
                        f"IBVAP EVIDENCE CAPTURE | CAM: {self.camera_id} | VID: {self.video_id or 'LIVE'} | "
                        f"EVT #{evt_id} | FRAME {frame_idx} ({video_timestamp:.2f}s) | "
                        f"{rule_res['event_type'].upper()} | SEV: {rule_res['severity'].upper()} | {event_time_str}"
                    )
                    cv2.putText(snap_annotated, banner_text, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 1, cv2.LINE_AA)

                    # 4. Write evidence snapshot to disk with explicit verification
                    snap_ok = cv2.imwrite(str(snap_path), snap_annotated)
                    if not snap_ok:
                        logger.error(f"[EVIDENCE GENERATION FAILED] Could not write snapshot image to {snap_path}")
                        snapshot_url = None
                    else:
                        snapshot_url = f"/evidence/{snap_filename}"
                        public_ev_dir = PROJECT_ROOT / "public" / "evidence"
                        public_ev_dir.mkdir(parents=True, exist_ok=True)
                        try:
                            cv2.imwrite(str(public_ev_dir / snap_filename), snap_annotated)
                        except Exception as pub_e:
                            logger.warning(f"Failed mirroring snapshot to public: {pub_e}")

                    # 5. Extract and save target crop for forensics inspection
                    crop_url = None
                    try:
                        bx1 = max(0, int(bbox[0] * w - 12))
                        by1 = max(0, int(bbox[1] * h - 12))
                        bx2 = min(w, int(bbox[2] * w + 12))
                        by2 = min(h, int(bbox[3] * h + 12))
                        if bx2 > bx1 + 10 and by2 > by1 + 10:
                            crop_img = frame[by1:by2, bx1:bx2]
                            crop_ok = cv2.imwrite(str(crop_path), crop_img)
                            if crop_ok:
                                crop_url = f"/evidence/{crop_filename}"
                                try:
                                    cv2.imwrite(str(public_ev_dir / crop_filename), crop_img)
                                except Exception:
                                    pass
                            else:
                                logger.error(f"[EVIDENCE CROP FAILED] Could not write target crop image to {crop_path}")
                    except Exception as crop_err:
                        logger.error(f"Error generating target crop: {crop_err}")

                    # 6. Update SecurityEvent with verified paths
                    sec_event.snapshot_path = snapshot_url
                    updated_details = dict(sec_event.details or {})
                    updated_details["crop_path"] = crop_url
                    sec_event.details = updated_details

                    # 7. Create formal Snapshot table record
                    if snapshot_url:
                        snap_rec = Snapshot(
                            event_id=evt_id,
                            camera_id=self.camera_id,
                            video_id=self.video_id,
                            filepath=snapshot_url,
                            filename=snap_filename,
                            timestamp=datetime.datetime.utcnow(),
                            metadata_json={
                                "frame_number": frame_idx,
                                "video_timestamp": round(video_timestamp, 3),
                                "tracking_id": tid,
                                "crop_path": crop_url,
                                "event_type": rule_res["event_type"],
                                "severity": rule_res["severity"],
                                "risk_score": threat_calc["score"]
                            }
                        )
                        db.add(snap_rec)

                    # 8. Create Alert record linked to SecurityEvent
                    alert = Alert(
                        title=f"{rule_res['event_type']} - Track ID {tid}",
                        severity=rule_res["severity"],
                        status="ACTIVE",
                        camera_id=self.camera_id,
                        event_id=sec_event.id
                    )
                    db.add(alert)
                    db.commit()
                    db.refresh(sec_event)

                    latest_event = {
                        "id": sec_event.id,
                        "time": event_time_str,
                        "event": rule_res["event_type"],
                        "event_type": rule_res["event_type"],
                        "object": f"{cls_name.capitalize()} (ID {tid})",
                        "camera": self.camera_id,
                        "severity": rule_res["severity"],
                        "track_id": tid,
                        "confidence": conf_str,
                        "direction": dir_str,
                        "speed": det.get("speed", "Est. 0.0 px/s"),
                        "dwell_time": det.get("dwell_time", "0 sec"),
                        "distance": rule_res["distance_to_fence"],
                        "snapshot_path": snapshot_url,
                        "crop_path": crop_url,
                        "verified": False
                    }

            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error persisting pipeline data: {e}", exc_info=True)
            if 'snap_path' in locals() and hasattr(snap_path, 'exists') and snap_path.exists():
                try:
                    snap_path.unlink()
                except Exception:
                    pass
            if 'crop_path' in locals() and hasattr(crop_path, 'exists') and crop_path.exists():
                try:
                    crop_path.unlink()
                except Exception:
                    pass
        finally:
            db.close()

        # Dynamic Threat Assessment
        threat_assessment = self.risk_engine.compute_threat(
            active_entities=active_entities,
            any_zone_breach=any_zone_breach,
            any_border_crossing=any_border_crossing,
            min_fence_dist=min_fence_dist if min_fence_dist < 999.0 else None,
            is_night=is_night,
            active_events=active_events
        )

        progress = round((frame_idx / max(1, self.total_frames)) * 100, 1) if self.total_frames > 0 else 0.0

        track_ids = [d.get("tracking_id") for d in tracked_detections if d.get("tracking_id") is not None]
        if frame_idx % 10 == 0:
            logger.info(
                f"[CV] camera_id={self.camera_id} frame={frame_idx} detections={len(raw_detections)} "
                f"persons={counts['persons']} vehicles={counts['vehicles']} animals={counts['animals']} "
                f"tracks={counts['active_tracks']} track_ids={track_ids} "
                f"inference_ms={int(infer_ms)} processing_fps={round(self.fps, 1)}"
            )
            logger.info(
                f"PIPELINE STATE: {{'persons': {counts['persons']}, 'vehicles': {counts['vehicles']}, "
                f"'animals': {counts['animals']}, 'active_tracks': {counts['active_tracks']}, "
                f"'threat_score': {threat_assessment['score']}, 'threat_level': '{threat_assessment['level']}', "
                f"'tracked_detections': {len(tracked_detections)}}}"
            )

        # Draw real annotations and update live stream frame buffer (optimized preview size)
        annotated_frame = self.draw_annotations(frame.copy(), tracked_detections, video_timestamp)
        if w > 640:
            scale = 640.0 / w
            preview_frame = cv2.resize(annotated_frame, (640, int(h * scale)), interpolation=cv2.INTER_LINEAR)
        else:
            preview_frame = annotated_frame
        ret_enc, buf_enc = cv2.imencode('.jpg', preview_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ret_enc:
            update_stream_frame(self.camera_id, buf_enc.tobytes())

        return {
            "camera_id": self.camera_id,
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
            "video_timestamp": round(video_timestamp, 2),
            "frame_index": frame_idx,
            "total_frames": self.total_frames,
            "progress_percent": progress,
            "fps": round(self.fps, 1),
            "analysis_active": True,
            "live_intelligence": {
                "persons": counts["persons"],
                "vehicles": counts["vehicles"],
                "animals": counts["animals"],
                "active_tracks": counts["active_tracks"]
            },
            "threat_assessment": threat_assessment,
            "active_entities": active_entities,
            "tracked_detections": tracked_detections,
            "latest_event": latest_event
        }

    def stream_video(
        self,
        loop: bool = False,
        frame_stride: int = 1,
        seek_timestamp: Optional[float] = None
    ) -> Generator[Dict[str, Any], None, None]:
        if not self.video_path or not os.path.exists(self.video_path):
            logger.warning(f"Video file {self.video_path} not found.")
            return

        cap = cv2.VideoCapture(self.video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or self.total_frames)

        if seek_timestamp and seek_timestamp > 0:
            cap.set(cv2.CAP_PROP_POS_MSEC, seek_timestamp * 1000.0)
            frame_idx = int(seek_timestamp * fps)
        else:
            frame_idx = 0

        target_delay = (1.0 / max(10.0, min(30.0, fps))) * frame_stride

        while True:
            t0 = time.time()
            ret, frame = cap.read()
            if not ret:
                if loop:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_idx = 0
                    continue
                else:
                    logger.info(f"Video {self.video_path} reached EOF at frame {frame_idx}.")
                    break

            msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            if msec > 0:
                video_timestamp = round(msec / 1000.0, 3)
            else:
                video_timestamp = round(frame_idx / max(1.0, fps), 3)
            packet = self.process_frame(frame, frame_idx, video_timestamp)
            yield packet

            # Advance by frame stride using fast grab
            if frame_stride > 1:
                for _ in range(frame_stride - 1):
                    skip_ret = cap.grab()
                    frame_idx += 1
                    if not skip_ret:
                        break

            frame_idx += 1

            # Pacing to match video playback clock
            elapsed = time.time() - t0
            sleep_time = max(0.001, target_delay - elapsed)
            time.sleep(sleep_time)

        cap.release()
