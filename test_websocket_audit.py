import asyncio
import json
import websockets

async def record_websocket_packets():
    uri = "ws://localhost:8000/ws/live/CAM-01"
    recorded = []
    async with websockets.connect(uri) as ws:
        # 1. Initial State Packet
        pkt1 = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data1 = json.loads(pkt1)
        recorded.append(("1. INITIAL IDLE PACKET", {
            "type": data1.get("type"),
            "camera_id": data1.get("camera_id"),
            "analysis_active": data1.get("analysis_active"),
            "live_intelligence": data1.get("live_intelligence"),
            "threat_assessment": data1.get("threat_assessment"),
            "active_entities_count": len(data1.get("active_entities", []))
        }))

        # 2. Start Analysis
        print("[WS AUDIT] Sending start_analysis command...")
        await ws.send(json.dumps({
            "action": "start_analysis",
            "video": "Border_Test_03.mp4",
            "camera_id": "CAM-01"
        }))

        # 3. Read up to 4 active telemetry packets
        for i in range(4):
            pkt = await asyncio.wait_for(ws.recv(), timeout=12.0)
            data = json.loads(pkt)
            if data.get("analysis_active"):
                recorded.append((f"2.{i+1} ACTIVE ANALYSIS TELEMETRY PACKET", {
                    "type": data.get("type"),
                    "camera_id": data.get("camera_id"),
                    "frame_index": data.get("frame_index"),
                    "video_timestamp": data.get("video_timestamp"),
                    "analysis_active": data.get("analysis_active"),
                    "live_intelligence": data.get("live_intelligence"),
                    "threat_assessment": {
                        "score": data.get("threat_assessment", {}).get("score"),
                        "level": data.get("threat_assessment", {}).get("level"),
                        "key_factors": data.get("threat_assessment", {}).get("key_factors")
                    },
                    "active_entities": data.get("active_entities"),
                    "latest_event": data.get("latest_event")
                }))

        # 4. Stop Analysis
        print("[WS AUDIT] Sending stop_analysis command...")
        await ws.send(json.dumps({"action": "stop_analysis"}))
        
        # Read stop confirmation packet if any
        try:
            pkt_stop = await asyncio.wait_for(ws.recv(), timeout=3.0)
            data_stop = json.loads(pkt_stop)
            recorded.append(("3. STOP CONFIRMATION PACKET", {
                "type": data_stop.get("type"),
                "analysis_active": data_stop.get("analysis_active"),
                "status": data_stop.get("status")
            }))
        except Exception:
            pass

    print("\n" + "=" * 60)
    print("RECORDED WEBSOCKET TELEMETRY PACKETS")
    print("=" * 60)
    for title, content in recorded:
        print(f"\n--- {title} ---")
        print(json.dumps(content, indent=2))

if __name__ == "__main__":
    asyncio.run(record_websocket_packets())
