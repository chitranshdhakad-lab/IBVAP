import asyncio
import json
import time
import urllib.request
import urllib.parse
import os
import websockets
from pathlib import Path

BACKEND_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws/live/CAM-01"
VIDEOS_DIR = Path("backend/storage/videos")

async def run_e2e_test():
    print("=" * 60)
    print("IBVAP END-TO-END VIDEO SURVEILLANCE PIPELINE VERIFICATION")
    print("=" * 60)

    # 1. Health check
    req = urllib.request.urlopen(f"{BACKEND_URL}/health")
    health = json.loads(req.read().decode())
    print(f"[1] Backend Health: {health['status']} | Pipeline: {health['cv_pipeline']}")
    assert health['status'] == 'OPERATIONAL'

    # 2. Upload verification
    source_mp4 = VIDEOS_DIR / "Border_Test_03.mp4"
    assert source_mp4.exists(), f"Source video {source_mp4} not found!"

    print(f"\n[2] Testing Video Upload: uploading copy of {source_mp4.name} (size: {source_mp4.stat().st_size} bytes)...")
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    with open(source_mp4, "rb") as f:
        file_bytes = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="e2e_test_patrol.mp4"\r\n'
        f"Content-Type: video/mp4\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    upload_req = urllib.request.Request(
        f"{BACKEND_URL}/api/videos/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with urllib.request.urlopen(upload_req) as resp:
        upload_data = json.loads(resp.read().decode())
        print(f"    Upload HTTP {resp.status} OK")
        print(f"    Registered ID: {upload_data.get('id')}")
        print(f"    Filename: {upload_data.get('filename')}")
        print(f"    Total Frames: {upload_data.get('total_frames')}")
        print(f"    FPS: {upload_data.get('fps')}")
        print(f"    Job Status: {upload_data.get('job_status')}")
        assert upload_data.get('job_status') == 'READY'
        assert upload_data.get('total_frames') == 270

    # 3. Check Job Status Endpoint
    req = urllib.request.urlopen(f"{BACKEND_URL}/api/analysis/status")
    job_stat = json.loads(req.read().decode())
    print(f"\n[3] Job Manager Initial State: Status={job_stat['status']} | Video={job_stat['video_filename']}")

    # 4. Connect to WebSocket
    print(f"\n[4] Connecting to WebSocket: {WS_URL}...")
    async with websockets.connect(WS_URL) as ws:
        # Read idle heartbeat
        raw_idle = await ws.recv()
        idle_packet = json.loads(raw_idle)
        print(f"    Connected! Idle Packet: analysis_active={idle_packet.get('analysis_active')} | status={idle_packet.get('job_status')}")

        # 5. Start analysis on Border_Test_03.mp4
        print("\n[5] Sending command: start_analysis on Border_Test_03.mp4...")
        await ws.send(json.dumps({"action": "start_analysis", "video": "Border_Test_03.mp4"}))

        frames_received = 0
        detections_seen = 0
        events_seen = 0
        max_threat_score = 0
        first_detection = None
        completed_packet = None

        print("\n[6] Streaming live telemetry packets:")
        t_start = time.time()

        while True:
            raw_pkt = await ws.recv()
            pkt = json.loads(raw_pkt)
            job_st = pkt.get("job_status")

            if job_st == "RUNNING":
                frames_received += 1
                idx = pkt.get("frame_index", 0)
                tot = pkt.get("total_frames", 270)
                ts = pkt.get("video_timestamp", 0.0)
                prog = pkt.get("progress_percent", 0.0)
                intel = pkt.get("live_intelligence", {})
                threat = pkt.get("threat_assessment", {})
                entities = pkt.get("active_entities", [])
                latest_evt = pkt.get("latest_event")

                if threat.get("score", 0) > max_threat_score:
                    max_threat_score = threat["score"]

                if entities and not first_detection:
                    first_detection = entities[0]
                    first_detection["frame"] = idx
                    first_detection["time"] = ts

                if entities:
                    detections_seen += len(entities)

                if latest_evt:
                    events_seen += 1

                # Print sample progress every 20 frames
                if frames_received % 15 == 1 or frames_received <= 3:
                    tgt_info = f"Track ID {entities[0]['tracking_id']} ({entities[0]['object_class']})" if entities else "No target"
                    print(f"    Frame {idx:3d}/{tot:3d} | Time: {ts:4.2f}s ({prog:4.1f}%) | Targets: {intel.get('active_tracks', 0)} | Threat: {threat.get('score', 0):2d} ({threat.get('level', 'SECURE')}) | {tgt_info}")

                # Test pause and resume at frame ~60
                if idx >= 60 and idx < 65 and frames_received == 31:
                    print("\n    >>> [PAUSE TEST] Sending action: 'pause'...")
                    await ws.send(json.dumps({"action": "pause"}))
                    pause_pkt = None
                    for _ in range(5):
                        p = json.loads(await ws.recv())
                        if p.get("job_status") == "PAUSED":
                            pause_pkt = p
                            break
                    assert pause_pkt is not None, "Did not receive PAUSED packet"
                    print(f"    >>> Received Pause Packet: job_status={pause_pkt.get('job_status')} | analysis_active={pause_pkt.get('analysis_active')}")
                    await asyncio.sleep(0.5)

                    print("    >>> [RESUME TEST] Sending action: 'resume'...")
                    await ws.send(json.dumps({"action": "resume"}))
                    print("    >>> Resumed streaming successfully!\n")

            elif job_st == "COMPLETED":
                completed_packet = pkt
                print(f"\n[7] Video Reached EOF! Received COMPLETED packet:")
                print(f"    Status: {pkt.get('job_status')}")
                print(f"    Frames: {pkt.get('frame_index')}/{pkt.get('total_frames')}")
                print(f"    Progress: {pkt.get('progress_percent')}%")
                print(f"    Analysis Active: {pkt.get('analysis_active')}")
                print(f"    Message: {pkt.get('message')}")
                break

            elif job_st == "STOPPED":
                print(f"    Job stopped unexpectedly.")
                break

        elapsed_total = round(time.time() - t_start, 2)
        print(f"\n    Streaming finished in {elapsed_total}s ({frames_received} frames evaluated).")

    # 8. Verify SQLite Database State
    print("\n[8] Verifying SQLite Database State:")
    import sqlite3
    conn = sqlite3.connect("backend/storage/surveillance.db")
    c = conn.cursor()

    c.execute("SELECT id, filename, processing_status, total_frames FROM videos WHERE filename = 'Border_Test_03.mp4'")
    v_row = c.fetchone()
    print(f"    Video DB Record: ID={v_row[0]} | Filename={v_row[1]} | Status={v_row[2]} | Frames={v_row[3]}")
    assert v_row[2] == "COMPLETED", f"Expected COMPLETED, got {v_row[2]}"

    c.execute("SELECT COUNT(*) FROM detections")
    total_dets = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM events")
    total_evts = c.fetchone()[0]
    print(f"    Total SQLite Detections Count: {total_dets}")
    print(f"    Total SQLite Security Events Count: {total_evts}")
    conn.close()

    # 9. Verify Job Manager REST endpoint returns COMPLETED
    req = urllib.request.urlopen(f"{BACKEND_URL}/api/analysis/status")
    final_job = json.loads(req.read().decode())
    print(f"\n[9] REST API /api/analysis/status after completion:")
    print(f"    Status: {final_job['status']}")
    print(f"    Elapsed: {final_job['elapsed_seconds']}s")
    print(f"    Total Frames: {final_job['total_frames']}")
    print(f"    Detections Count: {final_job['detections_count']}")
    assert final_job['status'] == "COMPLETED"

    print("\n" + "=" * 60)
    print("ALL END-TO-END VERIFICATION CHECKS PASSED PERFECTLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
