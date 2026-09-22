"""
Comprehensive Audit & Verification of the IBVAP Threat & Risk Engine.
Validates:
1. Zero baseline: 0 active entities -> score 0 (SECURE).
2. Dynamic responsiveness: Score scales monotonically with real factors (person, approach, loitering, breach, crossing).
3. Score resets: Score drops immediately when conditions resolve or entities disappear.
4. Custom risk weights: Changing weights directly alters output.
5. Real video flow: YOLO -> Tracker -> Rules -> Risk -> Event -> DB -> Telemetry.
"""

import os
import sys
import time
import numpy as np

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.ai.risk_engine import ThreatRiskEngine
from app.ai.pipeline import SurveillancePipeline
from app.database import SessionLocal, init_db
from app.models import SecurityEvent, Alert, Detection as DetectionModel

def test_unit_threat_engine():
    print("\n" + "="*70)
    print("TEST 1: ThreatRiskEngine Unit Calibration & Sensitivity Audit")
    print("="*70)
    engine = ThreatRiskEngine()

    # 1. Zero state test
    zero_res = engine.compute_threat(active_entities=[], any_zone_breach=False, any_border_crossing=False, is_night=False)
    print(f"1. Zero State Check:")
    print(f"   Score: {zero_res['score']}, Level: {zero_res['level']}, Factors: {zero_res['key_factors']}")
    assert zero_res['score'] == 0, f"Expected 0 for clear perimeter, got {zero_res['score']}"
    assert zero_res['level'] == "SECURE", f"Expected SECURE, got {zero_res['level']}"
    assert "Perimeter clear" in zero_res['key_factors'][0]
    print("   -> PASSED: Clean zero baseline with no fake fallback.")

    # 2. Single target in buffer sector (no threat flags)
    benign_person = [{
        "tracking_id": 1,
        "category": "person",
        "class": "person",
        "direction": "Moving Parallel",
        "dwell_time": "1 sec",
        "distance_meters": 35.0,
        "is_breaching": False,
        "crossed_border": False
    }]
    benign_res = engine.compute_threat(active_entities=benign_person, is_night=False)
    print(f"\n2. Benign Person in Buffer Sector:")
    print(f"   Score: {benign_res['score']}, Level: {benign_res['level']}, Factors: {benign_res['key_factors']}")
    assert benign_res['score'] == 15, f"Expected 15 for single person, got {benign_res['score']}"
    assert benign_res['level'] == "LOW RISK", f"Expected LOW RISK, got {benign_res['level']}"
    print("   -> PASSED: Nominal activity correctly scored as LOW RISK.")

    # 3. Person turns and approaches boundary fence
    approaching_person = [{
        "tracking_id": 1,
        "category": "person",
        "class": "person",
        "direction": "Towards Border Fence",
        "dwell_time": "2 sec",
        "distance_meters": 22.0,
        "is_breaching": False,
        "crossed_border": False
    }]
    approach_res = engine.compute_threat(active_entities=approaching_person, is_night=False)
    print(f"\n3. Target Approaching Fence Vector:")
    print(f"   Score: {approach_res['score']}, Level: {approach_res['level']}, Factors: {approach_res['key_factors']}")
    # 15 (person) + 25 (approach) = 40
    assert approach_res['score'] == 40, f"Expected 40 for approaching person, got {approach_res['score']}"
    assert approach_res['level'] == "MEDIUM RISK", f"Expected MEDIUM RISK, got {approach_res['level']}"
    print("   -> PASSED: Vector approach escalates to MEDIUM RISK (40/100).")

    # 4. Target loiters near perimeter (dwell >= 4s)
    loitering_person = [{
        "tracking_id": 1,
        "category": "person",
        "class": "person",
        "direction": "Towards Border Fence",
        "dwell_time": "6 sec",
        "distance_meters": 18.0,
        "is_breaching": False,
        "crossed_border": False
    }]
    loiter_res = engine.compute_threat(active_entities=loitering_person, is_night=False)
    print(f"\n4. Target Loitering Near Perimeter (Dwell=6s):")
    print(f"   Score: {loiter_res['score']}, Level: {loiter_res['level']}, Factors: {loiter_res['key_factors']}")
    # 15 (person) + 25 (approach) + 15 (loiter) = 55
    assert loiter_res['score'] == 55, f"Expected 55, got {loiter_res['score']}"
    assert loiter_res['level'] == "HIGH RISK", f"Expected HIGH RISK, got {loiter_res['level']}"
    print("   -> PASSED: Loitering escalates to HIGH RISK (55/100).")

    # 5. Target breaches restricted zone
    breaching_person = [{
        "tracking_id": 1,
        "category": "person",
        "class": "person",
        "direction": "Towards Border Fence",
        "dwell_time": "6 sec",
        "distance_meters": 8.0,
        "is_breaching": True,
        "crossed_border": False
    }]
    breach_res = engine.compute_threat(active_entities=breaching_person, any_zone_breach=True, is_night=False)
    print(f"\n5. Restricted Zone Breach Active:")
    print(f"   Score: {breach_res['score']}, Level: {breach_res['level']}, Factors: {breach_res['key_factors']}")
    # 15 (person) + 25 (approach) + 15 (loiter) + 35 (zone breach) = 90
    assert breach_res['score'] == 90, f"Expected 90, got {breach_res['score']}"
    assert breach_res['level'] == "CRITICAL", f"Expected CRITICAL, got {breach_res['level']}"
    print("   -> PASSED: Zone breach triggers CRITICAL alert (90/100).")

    # 6. Target crosses border line
    crossing_person = [{
        "tracking_id": 1,
        "category": "person",
        "class": "person",
        "direction": "Towards Border Fence",
        "dwell_time": "8 sec",
        "distance_meters": 0.0,
        "is_breaching": True,
        "crossed_border": True
    }]
    crossing_res = engine.compute_threat(active_entities=crossing_person, any_zone_breach=True, any_border_crossing=True, is_night=False)
    print(f"\n6. Border Crossing Incursion:")
    print(f"   Score: {crossing_res['score']}, Level: {crossing_res['level']}, Factors: {crossing_res['key_factors']}")
    # 15 + 25 + 15 + 35 + 45 = 135 -> Clamped to 100
    assert crossing_res['score'] == 100, f"Expected clamped 100, got {crossing_res['score']}"
    assert crossing_res['level'] == "CRITICAL", f"Expected CRITICAL, got {crossing_res['level']}"
    print("   -> PASSED: Border crossing incursion clamped to maximum 100 CRITICAL.")

    # 7. Score Reset / De-escalation Test
    print(f"\n7. De-escalation & Zero Reset Test:")
    # Scenario A: Target steps back out of restricted zone
    stepped_back_res = engine.compute_threat(active_entities=benign_person, is_night=False)
    assert stepped_back_res['score'] == 15, f"Expected de-escalation to 15, got {stepped_back_res['score']}"
    print(f"   - Target leaves restricted zone: Score immediately drops from 100 -> {stepped_back_res['score']} (LOW RISK)")

    # Scenario B: Target departs scene entirely
    departed_res = engine.compute_threat(active_entities=[], is_night=False)
    assert departed_res['score'] == 0, f"Expected reset to 0, got {departed_res['score']}"
    print(f"   - Target leaves frame: Score immediately drops to {departed_res['score']} (SECURE)")
    print("   -> PASSED: Immediate zero-reset upon departure verified.")

    # 8. Dynamic Weight Customization Test
    custom_w = {
        "border_crossing": 30.0,
        "restricted_zone": 20.0,
        "approach": 10.0,
        "loitering": 5.0,
        "night_time": 5.0
    }
    custom_res = engine.compute_threat(active_entities=breaching_person, any_zone_breach=True, custom_weights=custom_w, is_night=False)
    # 15 (person) + 10 (approach) + 5 (loiter) + 20 (zone) = 50
    print(f"\n8. Custom Weights Reconfiguration Test:")
    print(f"   Score with customized weights: {custom_res['score']} (Expected: 50)")
    assert custom_res['score'] == 50, f"Expected 50 with custom weights, got {custom_res['score']}"
    print("   -> PASSED: Custom risk weights dynamically applied.")


def test_real_video_pipeline_flow():
    print("\n" + "="*70)
    print("TEST 2: End-to-End Real Video Surveillance Pipeline Audit")
    print("Flow: YOLO -> Tracker -> Rules -> Risk -> Event -> DB -> WebSocket Packet")
    print("="*70)

    video_path = "storage/videos/video_multi_object_patrol.mp4"
    if not os.path.exists(video_path):
        video_path = os.path.join(os.path.dirname(__file__), "storage", "videos", "video_multi_object_patrol.mp4")

    assert os.path.exists(video_path), f"Test video {video_path} not found!"

    init_db()

    pipeline = SurveillancePipeline(
        camera_id="CAM-RISK-AUDIT",
        video_path=video_path
    )

    db = SessionLocal()
    # Clean previous test records
    db.query(SecurityEvent).filter(SecurityEvent.camera_id == "CAM-RISK-AUDIT").delete()
    db.query(Alert).filter(Alert.camera_id == "CAM-RISK-AUDIT").delete()
    db.query(DetectionModel).filter(DetectionModel.camera_id == "CAM-RISK-AUDIT").delete()
    db.commit()

    print(f"Surveillance pipeline initialized for: {video_path}")
    print(f"Total frames: {pipeline.total_frames}, FPS: {pipeline.fps}")

    frames_processed = 0
    scores_recorded = []
    events_triggered = []

    # Stream frames through real CV pipeline
    for packet in pipeline.stream_video(loop=False, frame_stride=1):
        f_idx = packet["frame_index"]
        intel = packet["live_intelligence"]
        threat = packet["threat_assessment"]
        entities = packet["active_entities"]
        latest_evt = packet["latest_event"]

        score = threat["score"]
        level = threat["level"]
        factors = threat["key_factors"]
        scores_recorded.append(score)

        if latest_evt:
            events_triggered.append(latest_evt)

        # Print periodic telemetry verification
        if f_idx % 25 == 0 or latest_evt:
            evt_str = f" [EVENT: {latest_evt['event']} | Risk={score}]" if latest_evt else ""
            print(f"  Frame {f_idx:03d}: Targets={intel['active_tracks']} (P:{intel['persons']}, V:{intel['vehicles']}) | Threat={score:02d}/100 ({level}) | Factors={len(factors)}{evt_str}")

        frames_processed += 1
        if frames_processed >= 120:
            break

    print(f"\nProcessed {frames_processed} frames from real video.")
    print(f"Min threat score recorded: {min(scores_recorded)}")
    print(f"Max threat score recorded: {max(scores_recorded)}")
    print(f"Total security events generated: {len(events_triggered)}")

    # Verify score responsiveness
    assert min(scores_recorded) >= 0 and max(scores_recorded) <= 100
    assert len(set(scores_recorded)) > 1, "Threat score must vary dynamically based on target motion and rule conditions!"

    # Verify database persistence
    db_events = db.query(SecurityEvent).filter(SecurityEvent.camera_id == "CAM-RISK-AUDIT").all()
    print(f"\nDatabase Verification: Found {len(db_events)} SecurityEvents in DB:")
    for ev in db_events:
        print(f"  - Event #{ev.id}: Type='{ev.event_type}', TrackID={ev.tracking_id}, RiskScore={ev.risk_score}, Severity='{ev.severity}'")
        assert ev.risk_score is not None and 0 <= ev.risk_score <= 100
        assert len(ev.key_factors) > 0, "SecurityEvent must record real contributing factors"

    # Verify WebSocket packet structure
    assert "threat_assessment" in packet
    assert "score" in packet["threat_assessment"]
    assert "level" in packet["threat_assessment"]
    assert "key_factors" in packet["threat_assessment"]
    assert "description" in packet["threat_assessment"]
    print("\nWebSocket Telemetry Packet Schema Verified:")
    print(f"  {packet['threat_assessment']}")

    db.close()
    print("\n" + "="*70)
    print("ALL THREAT / RISK ENGINE AUDIT CHECKS PASSED SUCCESSFULLY!")
    print("="*70)

if __name__ == "__main__":
    test_unit_threat_engine()
    test_real_video_pipeline_flow()
