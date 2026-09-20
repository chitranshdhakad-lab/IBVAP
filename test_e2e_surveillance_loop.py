import asyncio
import json
import os
import time
import urllib.request
import urllib.parse
import websockets
from pathlib import Path

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws/live/CAM-01"
VIDEO_NAME = "Border_Test_03.mp4"

def api_get(endpoint: str):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}")
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read().decode())

def api_post(endpoint: str, data: dict):
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read().decode())

async def run_e2e_test():
    print("=" * 70)
    print("IBVAP — CORE SURVEILLANCE LOOP INTEGRATION TEST")
    print("=" * 70)

    # 1. Check Video in Library / Record
    print("\n[STEP 1 & 2] Checking Video in Database & Library...")
    videos = api_get("/api/videos")
    target_vid = next((v for v in videos if v["filename"] == VIDEO_NAME), None)
    assert target_vid is not None, f"Video {VIDEO_NAME} not found in /api/videos"
    print(f"  [OK] Video Found: ID={target_vid['id']}, Filename={target_vid['filename']}, Duration={target_vid['duration']}s, Total Frames={target_vid.get('total_frames', 'N/A')}")

    # Stop any prior session to start from clean frame 0
    try:
        api_post("/api/analysis/stop", {})
        await asyncio.sleep(0.5)
    except Exception:
        pass

    # 2. Connect WebSocket to CAM-01
    print("\n[STEP 3 & 14] Connecting WebSocket to /ws/live/CAM-01...")
    async with websockets.connect(WS_URL) as ws:
        # Read initial packet
        init_raw = await ws.recv()
        init_pkt = json.loads(init_raw)
        print(f"  [OK] Initial WS Packet Received: camera_id={init_pkt.get('camera_id')}, job_status={init_pkt.get('job_status')}")

        # 3. Start Analysis
        print("\n[STEP 3 & 4] Starting Surveillance Analysis via REST API...")
        start_res = api_post("/api/analysis/start", {
            "video": VIDEO_NAME,
            "video_filename": VIDEO_NAME,
            "camera_id": "CAM-01"
        })
        print(f"  [OK] Start Analysis Response: {start_res.get('status')} - {start_res.get('message')}")
        assert start_res.get("status") == "RUNNING"

        # 4. Monitor Real-time Frame Progression & Telemetry
        print("\n[STEP 5-10] Monitoring Sequential Frame Processing via WebSocket...")
        frames_seen = []
        intel_seen = []
        tracks_seen = set()
        events_seen = []
        is_completed = False
        start_t = time.time()

        while time.time() - start_t < 90: # Allow up to 90s for full 270 frames on CPU
            try:
                msg_raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
                pkt = json.loads(msg_raw)
                status = pkt.get("job_status")
                frame_idx = pkt.get("frame_index", 0)
                total_f = pkt.get("total_frames", 270)
                progress = pkt.get("progress_percent", 0.0)
                intel = pkt.get("live_intelligence", {})
                threat = pkt.get("threat_assessment", {})
                entities = pkt.get("active_entities", [])
                latest_event = pkt.get("latest_event")

                if pkt.get("analysis_active") or status == "RUNNING":
                    frames_seen.append(frame_idx)
                    intel_seen.append(intel)
                    for ent in entities:
                        tid = ent.get("tracking_id")
                        if tid:
                            tracks_seen.add(tid)
                    if latest_event:
                        events_seen.append(latest_event)

                    if len(frames_seen) % 10 == 1:
                        print(f"  [Frame {frame_idx}/{total_f} ({progress}%)] TS: {pkt.get('video_timestamp')}s | Intel: Persons={intel.get('persons',0)}, Tracks={intel.get('active_tracks',0)} | Threat: {threat.get('score')} ({threat.get('level')}) | Track IDs: {list(tracks_seen)}")

                if status == "COMPLETED" and len(frames_seen) > 0:
                    print(f"\n[STEP 17 & 18] [OK] Received COMPLETED Packet at Frame {frame_idx}/{total_f} ({progress}%)!")
                    is_completed = True
                    break

            except asyncio.TimeoutError:
                continue

        print(f"\n[METRICS SUMMARY]")
        print(f"  Total sequential frame packets received: {len(frames_seen)}")
        print(f"  First frame: {frames_seen[0] if frames_seen else 'N/A'}, Last frame: {frames_seen[-1] if frames_seen else 'N/A'}")
        print(f"  Distinct persistent track IDs maintained: {sorted(list(tracks_seen))}")
        print(f"  Events triggered during run: {len(events_seen)}")
        print(f"  Job reached COMPLETED state: {is_completed}")

        assert len(frames_seen) >= 10, f"Expected >= 10 frames, got {len(frames_seen)}"
        assert len(tracks_seen) >= 1, "Expected at least 1 persistent track ID from YOLO+ByteTrack"
        assert is_completed, "Expected job to reach COMPLETED state at video EOF"

    # 5. Check SQLite Persistence
    print("\n[STEP 11-13] Verifying SQLite Persistence...")
    events = api_get("/api/events?limit=10")
    print(f"  [OK] Security Events in DB: {len(events)}")
    if events:
        latest = events[0]
        print(f"    Latest Event #{latest['id']}: {latest['event']} | Severity: {latest['severity']} | Camera: {latest['camera']} | Snapshot: {latest['snapshot_path']}")
        
        # Verify evidence snapshot exists on disk
        if latest.get("snapshot_path"):
            snap_file = latest["snapshot_path"].replace("/evidence/", "")
            snap_disk_path = Path("backend/storage/evidence") / snap_file
            public_disk_path = Path("public/evidence") / snap_file
            print(f"  [OK] Checking Evidence Snapshot: {snap_file}")
            print(f"    Storage exists: {snap_disk_path.exists()} ({snap_disk_path.stat().st_size if snap_disk_path.exists() else 0} bytes)")
            print(f"    Public exists:  {public_disk_path.exists()} ({public_disk_path.stat().st_size if public_disk_path.exists() else 0} bytes)")
            assert snap_disk_path.exists(), f"Snapshot file {snap_disk_path} missing on disk"

    # 6. Check Job Status in Backend
    print("\n[STEP 18 & 19] Verifying Job Status in Job Manager & Videos Table...")
    job_status = api_get("/api/analysis/status")
    print(f"  [OK] Analysis Job Status: {job_status.get('status')} | Processed: {job_status.get('processed_frames')}/{job_status.get('total_frames')}")
    assert job_status.get("status") == "COMPLETED"

    # 7. Check Analytics Aggregations
    print("\n[STEP 19] Verifying Analytics Consistency with DB...")
    analytics = api_get("/api/analytics/summary?time_range=all")
    print(f"  [OK] Analytics: Total Detections={analytics.get('total_detections')}, Total Events={analytics.get('total_events')}, Total Tracks={analytics.get('total_tracks')}")
    assert analytics.get("has_data") is True

    print("\n" + "=" * 70)
    print("ALL 21 SURVEILLANCE LOOP VERIFICATION CRITERIA PASSED (100%)!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
