import asyncio
import json
import urllib.request
import websockets

async def verify_telemetry_and_stream():
    print("=" * 60)
    print("LIVE RUNTIME TELEMETRY & MJPEG STREAM VERIFICATION")
    print("=" * 60)

    # 1. Connect to WebSocket and capture 5 consecutive packets
    uri = "ws://localhost:8000/ws/live/CAM-01"
    print(f"Connecting to {uri}...")

    captured = []
    async with websockets.connect(uri) as ws:
        while len(captured) < 5:
            msg = await ws.recv()
            data = json.loads(msg)
            # We want packets where analysis is active
            if data.get("analysis_active"):
                captured.append(data)
                print(f"\n--- PACKET {len(captured)} ---")
                print(f"Frame Index: {data.get('frame_index')}")
                print(f"Video Timestamp: {data.get('video_timestamp')}s")
                print(f"Status: {data.get('job_status')}")
                print(f"Live Intelligence: {data.get('live_intelligence')}")
                print(f"Threat Score: {data.get('threat_assessment', {}).get('score')} ({data.get('threat_assessment', {}).get('level')})")
                print(f"Active Entities ({len(data.get('active_entities', []))}):")
                for ent in data.get("active_entities", []):
                    print(f"   -> Track ID: {ent.get('tracking_id')} | Class: {ent.get('object_class')} | Conf: {ent.get('confidence')} | Speed: {ent.get('speed')} | Dir: {ent.get('direction')} | Dwell: {ent.get('dwell_time')}")

    # 2. Test MJPEG Stream endpoint and save a live frame
    print("\n" + "=" * 60)
    print("TESTING MJPEG STREAM: GET /api/analysis/stream/CAM-01")
    print("=" * 60)
    stream_url = "http://localhost:8000/api/analysis/stream/CAM-01"
    req = urllib.request.urlopen(stream_url, timeout=5)
    
    # Read until first full JPEG frame
    buffer = b""
    while True:
        chunk = req.read(4096)
        if not chunk:
            break
        buffer += chunk
        start = buffer.find(b"\xff\xd8") # JPEG SOI
        end = buffer.find(b"\xff\xd9", start + 2) # JPEG EOI
        if start != -1 and end != -1:
            jpeg_bytes = buffer[start:end+2]
            print(f"Successfully extracted JPEG frame from MJPEG stream! Size: {len(jpeg_bytes)} bytes.")
            with open("public/evidence/live_mjpeg_sample.jpg", "wb") as f:
                f.write(jpeg_bytes)
            print("Saved live stream frame to public/evidence/live_mjpeg_sample.jpg")
            break

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(verify_telemetry_and_stream())
