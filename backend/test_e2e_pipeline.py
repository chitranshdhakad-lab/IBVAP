import asyncio
import json
import time
import urllib.request
import sqlite3
import websockets
from pathlib import Path

STORAGE_DB = Path("backend/storage/surveillance.db")

async def test_full_pipeline():
    print("=" * 60)
    print("IBVAP END-TO-END CV PIPELINE VERIFICATION TEST")
    print("=" * 60)

    # 1. Check initial DB counts
    con = sqlite3.connect(STORAGE_DB)
    cur = con.cursor()
    det_start = cur.execute("SELECT count(*) FROM detections").fetchone()[0]
    evt_start = cur.execute("SELECT count(*) FROM security_events").fetchone()[0]
    con.close()
    print(f"[DB] Initial detections: {det_start}, events: {evt_start}")

    # 2. Connect to WebSocket
    uri = "ws://localhost:8000/ws/live/CAM-01"
    print(f"[WS] Connecting to {uri}...")
    
    packets = []
    track_ids_observed = set()
    events_observed = []
    
    t_start = time.time()

    async with websockets.connect(uri) as ws:
        # Send start_analysis
        start_cmd = {
            "action": "start_analysis",
            "video": "Border_Test_03.mp4",
            "camera_id": "CAM-01"
        }
        print(f"[WS] Sending: {start_cmd}")
        await ws.send(json.dumps(start_cmd))

        # Receive packets until analysis completes or reaches timeout
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=20.0)
                data = json.loads(msg)
                status = data.get("job_status")
                frame_idx = data.get("frame_index")
                intel = data.get("live_intelligence", {})
                entities = data.get("active_entities", [])
                threat = data.get("threat_assessment", {})
                evt = data.get("latest_event")

                for ent in entities:
                    tid = ent.get("tracking_id")
                    if tid is not None:
                        track_ids_observed.add(tid)

                if evt and evt not in events_observed:
                    events_observed.append(evt)

                packets.append(data)

                if frame_idx is not None and frame_idx % 20 == 0:
                    print(f"  Frame {frame_idx:3d} | Status: {status} | Persons: {intel.get('persons')} | Active Tracks: {intel.get('active_tracks')} | Threat: {threat.get('score')} ({threat.get('level')})")

                if status == "COMPLETED" or not data.get("analysis_active", True) and len(packets) > 10:
                    print(f"[WS] Analysis reached COMPLETED status at frame {frame_idx}!")
                    break

            except asyncio.TimeoutError:
                print("[WS] Timeout waiting for next packet.")
                break

    duration = time.time() - t_start
    total_packets = len(packets)
    print("\n" + "=" * 60)
    print("PIPELINE TEST SUMMARY RESULTS")
    print("=" * 60)
    print(f"Total processing time: {duration:.2f}s")
    print(f"Total packets received: {total_packets}")
    print(f"Observed Track IDs: {sorted(list(track_ids_observed))}")
    print(f"Unique Events generated: {len(events_observed)}")

    # 3. Check DB counts after
    con = sqlite3.connect(STORAGE_DB)
    cur = con.cursor()
    det_end = cur.execute("SELECT count(*) FROM detections").fetchone()[0]
    evt_end = cur.execute("SELECT count(*) FROM security_events").fetchone()[0]
    con.close()
    print(f"[DB] Final detections: {det_end} (+{det_end - det_start})")
    print(f"[DB] Final events: {evt_end} (+{evt_end - evt_start})")

    # 4. Check MJPEG stream sample
    try:
        req = urllib.request.urlopen("http://localhost:8000/api/analysis/stream/CAM-01", timeout=5)
        # Read a couple KB to confirm stream active
        sample = req.read(4096)
        print(f"[MJPEG STREAM] Stream active, successfully read {len(sample)} bytes of JPEG data.")
    except Exception as e:
        print(f"[MJPEG STREAM] Error reading stream: {e}")

if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
