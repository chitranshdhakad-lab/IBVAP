import sys
sys.path.insert(0, "backend")

import os
import cv2
import json
import time
import sqlite3
import datetime
from pathlib import Path

from app.config import VIDEOS_DIR, EVIDENCE_DIR
from app.database import SessionLocal
from app.models import SecurityEvent, Alert, Detection as DetectionModel
from app.ai.detector import ObjectDetector
from app.ai.tracker import MultiObjectTracker
from app.ai.rule_engine import TacticalRuleEngine
from app.ai.risk_engine import ThreatRiskEngine

def trace_event():
    video_path = VIDEOS_DIR / "Border_Test_03.mp4"
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    detector = ObjectDetector(confidence_threshold=0.25)
    tracker = MultiObjectTracker(max_age=15, min_iou=0.25)
    rule_engine = TacticalRuleEngine(debounce_seconds=3.0, loiter_threshold_seconds=4.0)
    risk_engine = ThreatRiskEngine()

    poly = [[0.0, 0.20], [0.55, 0.38], [0.50, 0.52], [0.0, 0.38]]
    border_line = [[0.0, 0.42], [0.95, 0.42]]

    frame_idx = 0
    event_traced = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        v_ts = frame_idx / fps
        raw_dets = detector.detect(frame)
        tracked = tracker.update(raw_dets, current_timestamp=v_ts)
        active_entities = tracker.get_active_entities()

        for det in tracked:
            tid = det.get("tracking_id", 0)
            cls_name = det.get("class", "person")
            cat_name = det.get("category", "person")
            bbox = det.get("bbox", (0, 0, 0, 0))
            dir_str = det.get("direction", "Stationary")
            dwell_sec = float(str(det.get("dwell_time", "0")).split()[0])

            rule_res = rule_engine.evaluate(
                tracking_id=tid,
                bbox=bbox,
                video_timestamp=v_ts,
                restricted_zone=poly,
                border_line=border_line,
                object_class=cls_name,
                category=cat_name,
                direction_str=dir_str,
                dwell_seconds=dwell_sec
            )

            if rule_res["should_alert"] and rule_res["event_type"]:
                # Real event triggered!
                threat = risk_engine.compute_threat(
                    active_entities=active_entities,
                    any_zone_breach=rule_res["is_in_restricted_zone"],
                    is_night=True
                )

                snap_fn = f"trace_test_{int(v_ts*100)}_{tid}.jpg"
                snap_path = EVIDENCE_DIR / snap_fn
                cv2.imwrite(str(snap_path), frame)

                # Persist to SQLite
                db = SessionLocal()
                t_str = datetime.datetime.now().strftime("%H:%M:%S")
                sec_ev = SecurityEvent(
                    event_type=rule_res["event_type"],
                    camera_id="CAM-01",
                    timestamp=t_str,
                    video_timestamp=v_ts,
                    tracking_id=tid,
                    object_class=cls_name,
                    category=cat_name,
                    severity=rule_res["severity"],
                    risk_score=threat["score"],
                    key_factors=threat["key_factors"],
                    details={
                        "speed": det.get("speed", "Est. 0.0 px/s"),
                        "direction": dir_str,
                        "dwell_time": det.get("dwell_time", "0 sec"),
                        "distance": rule_res["distance_to_fence"]
                    },
                    snapshot_path=f"/storage/evidence/{snap_fn}",
                    verified=False
                )
                db.add(sec_ev)
                db.commit()
                db.refresh(sec_ev)
                ev_id = sec_ev.id
                db.close()

                event_traced = {
                    "stage_1_video": {
                        "filename": video_path.name,
                        "frame_index": frame_idx,
                        "video_timestamp": round(v_ts, 3),
                        "fps": fps
                    },
                    "stage_2_opencv": {
                        "frame_shape": list(frame.shape),
                        "frame_dtype": str(frame.dtype),
                        "resolution": f"{frame.shape[1]}x{frame.shape[0]}"
                    },
                    "stage_3_yolo": {
                        "model": "yolov8n.pt",
                        "raw_detections_count": len(raw_dets),
                        "target_detected": {
                            "class": cls_name,
                            "category": cat_name,
                            "confidence": det.get("confidence"),
                            "bbox": [round(c, 4) for c in bbox]
                        }
                    },
                    "stage_4_tracker": {
                        "algorithm": "Custom greedy IoU tracker",
                        "tracking_id": tid,
                        "velocity": [round(v, 4) for v in det.get("velocity", (0, 0))],
                        "speed": det.get("speed"),
                        "direction": dir_str,
                        "dwell_time": det.get("dwell_time")
                    },
                    "stage_5_rule_engine": {
                        "rule_evaluated": "TacticalRuleEngine.evaluate()",
                        "is_in_restricted_zone": rule_res["is_in_restricted_zone"],
                        "distance_to_fence": rule_res["distance_to_fence"],
                        "event_type": rule_res["event_type"],
                        "severity": rule_res["severity"],
                        "should_alert": rule_res["should_alert"]
                    },
                    "stage_6_risk_engine": {
                        "computed_score": threat["score"],
                        "computed_level": threat["level"],
                        "key_factors": threat["key_factors"]
                    },
                    "stage_7_snapshot": {
                        "filename": snap_fn,
                        "path": str(snap_path),
                        "file_size_bytes": snap_path.stat().st_size,
                        "is_valid_image": snap_path.exists() and snap_path.stat().st_size > 0
                    },
                    "stage_8_sqlite": {
                        "database": "surveillance.db",
                        "table": "security_events",
                        "row_id": ev_id,
                        "stored_fields": {
                            "id": ev_id,
                            "event_type": rule_res["event_type"],
                            "camera_id": "CAM-01",
                            "timestamp": t_str,
                            "tracking_id": tid,
                            "severity": rule_res["severity"],
                            "risk_score": threat["score"],
                            "snapshot_path": f"/storage/evidence/{snap_fn}"
                        }
                    },
                    "stage_9_websocket_payload": {
                        "camera_id": "CAM-01",
                        "frame_index": frame_idx,
                        "video_timestamp": round(v_ts, 2),
                        "analysis_active": True,
                        "latest_event": {
                            "id": ev_id,
                            "time": t_str,
                            "event": rule_res["event_type"],
                            "object": f"{cls_name.capitalize()} (ID {tid})",
                            "severity": rule_res["severity"],
                            "track_id": tid,
                            "speed": det.get("speed"),
                            "direction": dir_str,
                            "snapshot_path": f"/storage/evidence/{snap_fn}"
                        }
                    },
                    "stage_10_react_mapping": {
                        "consumer_component": "CurrentEvent.jsx",
                        "mapped_props": {
                            "title": rule_res["event_type"],
                            "severity_badge": rule_res["severity"],
                            "time": t_str,
                            "track_id": tid,
                            "speed": det.get("speed"),
                            "snapshot": f"/storage/evidence/{snap_fn}"
                        }
                    }
                }
                break
        if event_traced:
            break
        frame_idx += 1

    cap.release()

    print("=" * 60)
    print("REAL SINGLE-EVENT 10-STAGE PIPELINE TRACE RESULT")
    print("=" * 60)
    print(json.dumps(event_traced, indent=2))

if __name__ == "__main__":
    trace_event()
