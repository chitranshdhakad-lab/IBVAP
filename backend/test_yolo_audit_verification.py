import os
import sys
import time
from pathlib import Path
import cv2
import numpy as np

# Ensure backend directory is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.ai.detector import ObjectDetector, get_yolo_model, ALLOWED_SURVEILLANCE_CLASSES, PERSON_CLASSES, VEHICLE_CLASSES, ANIMAL_CLASSES
from app.ai.pipeline import SurveillancePipeline
from app.database import SessionLocal
from app.models import Detection, SecurityEvent, Alert, Video

def test_singleton_model_load():
    print("\n--- TEST 1: Model Loads Once (Singleton Pattern) ---")
    d1 = ObjectDetector()
    d2 = ObjectDetector()
    d3 = ObjectDetector()
    
    assert d1.model is not None, "d1.model should not be None"
    assert d1.model is d2.model, "d1.model and d2.model must be the exact same in-memory singleton object!"
    assert d2.model is d3.model, "d2.model and d3.model must be the exact same in-memory singleton object!"
    print(f"PASS: ObjectDetector models share identical memory address: {hex(id(d1.model))}")
    print(f"PASS: Model loaded once successfully. Supported classes count: {len(d1.model.names)}")

def test_inference_and_strict_classes():
    print("\n--- TEST 2: Real Person/Vehicle/Animal Inference Only & Direct Confidence ---")
    detector = ObjectDetector(confidence_threshold=0.25)
    
    cap = cv2.VideoCapture("storage/videos/video_02_perimeter_breach.mp4")
    assert cap.isOpened(), "Could not open video_02_perimeter_breach.mp4"
    
    # Seek to frame 30 where person is clearly visible
    cap.set(cv2.CAP_PROP_POS_FRAMES, 30)
    ret, frame = cap.read()
    assert ret, "Could not read frame 30"
    cap.release()

    dets = detector.detect(frame)
    print(f"Detections found on frame 30: {len(dets)}")
    assert len(dets) > 0, "Expected at least 1 person detection on frame 30"
    
    for d in dets:
        cname = d["class"]
        raw_cname = d["raw_class"]
        conf = d["confidence"]
        bbox = d["bbox"]
        pbbox = d["pixel_bbox"]
        
        print(f"  Det: class={cname} (raw={raw_cname}) conf={conf} bbox={bbox} pixel_bbox={pbbox}")
        
        # Verify strict class
        assert raw_cname in ALLOWED_SURVEILLANCE_CLASSES, f"Class {raw_cname} not in allowed surveillance classes!"
        assert d["category"] in ["person", "vehicle", "animal"], f"Category {d['category']} must be person, vehicle, or animal!"
        
        # Verify confidence is genuine inference float
        assert isinstance(conf, float), f"Confidence {conf} must be a float!"
        assert 0.0 < conf <= 1.0, f"Confidence {conf} must be in range (0.0, 1.0]"
        
        # Verify bounding box bounds
        x1, y1, x2, y2 = bbox
        assert 0.0 <= x1 < x2 <= 1.0, f"Normalized bbox x-coordinates invalid: {bbox}"
        assert 0.0 <= y1 < y2 <= 1.0, f"Normalized bbox y-coordinates invalid: {bbox}"
        
        # Verify pixel bbox bounds
        px1, py1, px2, py2 = pbbox
        h, w = frame.shape[:2]
        assert 0 <= px1 < px2 <= w, f"Pixel bbox x-coords out of range: {pbbox}"
        assert 0 <= py1 < py2 <= h, f"Pixel bbox y-coords out of range: {pbbox}"

    print("PASS: All detections are genuine person/vehicle/animal with direct inference confidence and frame-accurate bboxes.")

def test_pipeline_end_to_end():
    print("\n--- TEST 3: Pipeline Flow to Tracker, Rules, Threat, Events and Database ---")
    video_path = "storage/videos/video_02_perimeter_breach.mp4"
    pipeline = SurveillancePipeline(camera_id="CAM-01", video_path=video_path)
    
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 270)
    
    frames_to_test = 50
    t0 = time.time()
    events_generated = 0
    detections_generated = 0
    
    for f_idx in range(frames_to_test):
        ret, frame = cap.read()
        if not ret:
            break
        ts = f_idx / fps
        packet = pipeline.process_frame(frame, f_idx, ts)
        
        active_dets = packet.get("tracked_detections", [])
        detections_generated += len(active_dets)
        
        if packet.get("latest_event"):
            events_generated += 1
            evt = packet["latest_event"]
            print(f"  Frame {f_idx}: Event Fired -> {evt['event']} | {evt['object']} | Conf: {evt['confidence']} | Threat: {packet['threat_assessment']['score']}/100")
            assert evt["confidence"].endswith("%"), f"Event confidence must be formatted %: {evt['confidence']}"
            assert "% (YOLOv8)" not in evt["confidence"], "No mock static strings allowed!"
            assert "AI Detected" not in evt["confidence"], "No mock static strings allowed!"

    elapsed = time.time() - t0
    cap.release()
    actual_fps = round(frames_to_test / elapsed, 1)
    print(f"Processed {frames_to_test} frames in {elapsed:.2f}s ({actual_fps} FPS). Total detections: {detections_generated}, Events: {events_generated}")
    
    # Verify Database records
    db = SessionLocal()
    db_dets = db.query(Detection).filter(Detection.camera_id == "CAM-01").order_by(Detection.id.desc()).limit(10).all()
    assert len(db_dets) > 0, "Expected Detection rows in SQLite database!"
    latest_db_det = db_dets[0]
    print(f"Latest DB Detection: frame={latest_db_det.frame_number} conf={latest_db_det.confidence} bbox={latest_db_det.bbox}")
    assert latest_db_det.confidence > 0.0, "DB Detection confidence must be > 0"
    
    db_events = db.query(SecurityEvent).filter(SecurityEvent.camera_id == "CAM-01").order_by(SecurityEvent.id.desc()).limit(5).all()
    assert len(db_events) > 0, "Expected SecurityEvent rows in SQLite database!"
    latest_event = db_events[0]
    print(f"Latest DB SecurityEvent: id={latest_event.id} type={latest_event.event_type} obj={latest_event.object_class} snap={latest_event.snapshot_path}")
    print(f"  Event Details: {latest_event.details}")
    assert "confidence" in latest_event.details, "confidence must be present in SecurityEvent details!"
    assert latest_event.details["confidence"].endswith("%"), "confidence must be percentage!"
    
    # Check snapshot file exists
    if latest_event.snapshot_path:
        snap_rel = latest_event.snapshot_path.replace("/evidence/", "")
        snap_full = Path("storage/evidence") / snap_rel
        public_snap = Path("../public/evidence") / snap_rel
        assert snap_full.exists() or public_snap.exists(), f"Snapshot image not found on disk: {snap_full}"
        print(f"PASS: Evidence snapshot verified on disk: {latest_event.snapshot_path}")
    
    db.close()
    print("PASS: Tracker, rules, threat assessment, events, and database are fully wired with genuine inference.")
    return actual_fps, detections_generated, events_generated

def run_all_tests():
    test_singleton_model_load()
    test_inference_and_strict_classes()
    fps, dets, events = test_pipeline_end_to_end()
    print("\n==================================================")
    print(f"AUDIT & FIX VERIFICATION COMPLETE: ALL TESTS PASSED!")
    print(f"Empirical Results: {dets} Detections, {events} Events, Processing FPS: {fps}")
    print("==================================================")

if __name__ == "__main__":
    run_all_tests()
