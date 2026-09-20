import asyncio
import json
import websockets

async def test_ws():
    uri = "ws://localhost:8000/ws/live/CAM-01"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket successfully!")
            for i in range(3):
                msg = await websocket.recv()
                data = json.loads(msg)
                print(f"Received Packet {i+1}:")
                print(f"  Camera: {data.get('camera_id')}")
                print(f"  Intelligence: {data.get('live_intelligence')}")
                print(f"  Risk Score: {data.get('threat_assessment', {}).get('score')}")
                print(f"  Active Tracks: {len(data.get('active_entities', []))}")
            print("WebSocket test passed!")
    except Exception as e:
        print(f"WebSocket test exception: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws())
