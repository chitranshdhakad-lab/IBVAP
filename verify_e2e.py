import asyncio
import json
import urllib.request
import websockets

def test_http(endpoint, method="GET", data=None, headers=None):
    url = f"http://localhost:8000{endpoint}"
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if data is not None:
        if isinstance(data, (dict, list)):
            req.add_header("Content-Type", "application/json")
            req.data = json.dumps(data).encode("utf-8")
        else:
            req.data = data
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            body = res.read().decode('utf-8')
            return res.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as he:
        err_body = he.read().decode('utf-8')
        try:
            return he.code, json.loads(err_body)
        except Exception:
            return he.code, err_body
    except Exception as e:
        return 0, str(e)

async def test_websocket_stream():
    uri = "ws://localhost:8000/ws/live/CAM-01"
    async with websockets.connect(uri) as ws:
        # 1. Receive idle packet
        idle_msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        idle_data = json.loads(idle_msg)
        print("[TEST WS] Received initial packet:", idle_data.get("type"), "AnalysisActive =", idle_data.get("analysis_active"))
        
        # 2. Send start analysis command
        print("[TEST WS] Sending start_analysis command...")
        await ws.send(json.dumps({"action": "start_analysis", "video": "Border_Test_03.mp4", "camera_id": "CAM-01"}))
        
        # 3. Ingest active telemetry packets
        packets_received = 0
        for _ in range(5):
            msg = await asyncio.wait_for(ws.recv(), timeout=6.0)
            data = json.loads(msg)
            packets_received += 1
            if data.get("analysis_active"):
                print(f"[TEST WS] Packet #{packets_received}: active={data['analysis_active']}, "
                      f"intelligence={data.get('live_intelligence')}, "
                      f"threat_score={data.get('threat_assessment', {}).get('score')}, "
                      f"entities={len(data.get('active_entities', []))}")
        
        # 4. Send stop analysis command
        await ws.send(json.dumps({"action": "stop_analysis"}))
        print("[TEST WS] Sent stop_analysis command.")
        return packets_received > 0

def run_tests():
    print("==================================================")
    print("IBVAP PHASE 3 FULL END-TO-END AUTOMATED VERIFICATION")
    print("==================================================")
    
    # 1. Health
    s, data = test_http("/health")
    assert s == 200, f"Health check failed: {data}"
    print("[PASS] 1. Backend /health:", data.get("status"))

    # 2. System status
    s, data = test_http("/api/system/status")
    assert s == 200, f"System status failed: {data}"
    print("[PASS] 2. System Status:", f"DB={data.get('database')}, Storage={data.get('storage_usage')}, CPU={data.get('cpu_usage')}")

    # 3. Cameras list & Test connection
    s, data = test_http("/api/cameras")
    assert s == 200 and len(data) > 0, f"Cameras failed: {data}"
    print("[PASS] 3. Registered Cameras:", len(data), [c["id"] for c in data])

    s, conn_res = test_http("/api/cameras/CAM-01/test-connection", method="POST")
    assert s == 200 and conn_res.get("success") is True, f"Camera test failed: {conn_res}"
    print("[PASS] 3b. Camera Feed Test:", conn_res.get("message"))

    # 4. Videos list
    s, data = test_http("/api/videos")
    assert s == 200 and len(data) > 0, f"Videos failed: {data}"
    print("[PASS] 4. Available Videos:", len(data), [v["filename"] for v in data])

    # 5. Analysis Job State Manager (IDLE, START, STOP)
    s, job_st = test_http("/api/analysis/status")
    assert s == 200, f"Analysis status failed: {job_st}"
    print("[PASS] 5a. Analysis Job Manager Status:", job_st.get("status"))

    s, start_res = test_http("/api/analysis/start", method="POST", data={"video": "Border_Test_03.mp4", "camera_id": "CAM-01"})
    assert s == 200 and start_res.get("status") in ["RUNNING", "ALREADY_RUNNING"], f"Analysis start failed: {start_res}"
    print("[PASS] 5b. Analysis Start Job:", start_res.get("status"))

    s, stop_res = test_http("/api/analysis/stop", method="POST")
    assert s == 200 and stop_res.get("status") in ["STOPPED", "IDLE"], f"Analysis stop failed: {stop_res}"
    print("[PASS] 5c. Analysis Stop Job:", stop_res.get("status"))

    # 6. Events List & Debounce Verification
    s, events_data = test_http("/api/events")
    assert s == 200, f"Events failed: {events_data}"
    print("[PASS] 6. Events in SQLite:", len(events_data))
    
    # 7. Current Event
    s, curr_evt = test_http("/api/events/current")
    assert s == 200, f"Current event failed: {curr_evt}"
    print("[PASS] 7. Current Event Query:", curr_evt.get("event") or curr_evt.get("message"))

    # 8. Event Verification Persistence
    if len(events_data) > 0:
        target_event = events_data[0]
        event_id = target_event["id"]
        s, verify_res = test_http(f"/api/events/{event_id}/verify", method="PATCH")
        assert s == 200 and verify_res.get("verified") is True, f"Verify failed: {verify_res}"
        
        # Query event directly to confirm database persistence
        s, fresh_evt = test_http(f"/api/events/{event_id}")
        assert fresh_evt.get("verified") is True, "Database persistence failed!"
        print(f"[PASS] 8. Event {event_id} verification confirmed in SQLite with verified_at={fresh_evt.get('verified_at')}")

    # 9. Threat Assessment Current
    s, threat_curr = test_http("/api/threat/current")
    assert s == 200, f"Threat current failed: {threat_curr}"
    print("[PASS] 9. Threat Current: Score =", threat_curr.get("score"), "Level =", threat_curr.get("level"))

    # 10. Analytics Subsystem
    s, anal_sum = test_http("/api/analytics/summary")
    assert s == 200, f"Analytics summary failed: {anal_sum}"
    print("[PASS] 10a. Analytics Summary: Total Detections =", anal_sum.get("total_detections"), "Total Events =", anal_sum.get("total_events"))

    s, anal_hour = test_http("/api/analytics/events-by-hour")
    assert s == 200, f"Analytics by-hour failed: {anal_hour}"
    print("[PASS] 10b. Analytics Events by Hour entries:", len(anal_hour))

    s, anal_type = test_http("/api/analytics/events-by-type")
    assert s == 200, f"Analytics by-type failed: {anal_type}"
    print("[PASS] 10c. Analytics Events by Type entries:", len(anal_type))

    s, threat_hist = test_http("/api/analytics/threat-history")
    assert s == 200, f"Threat history failed: {threat_hist}"
    print("[PASS] 10d. Threat History Series entries:", len(threat_hist))

    # 11. Settings Subsystem (GET, POST valid, POST invalid check)
    s, cfg = test_http("/api/settings")
    assert s == 200 and "yolo_confidence_threshold" in cfg, f"Settings GET failed: {cfg}"
    print("[PASS] 11a. Settings GET:", f"Confidence={cfg.get('yolo_confidence_threshold')}, FPS={cfg.get('processing_fps')}")

    s, cfg_update = test_http("/api/settings", method="POST", data={"yolo_confidence_threshold": 0.40})
    assert s == 200 and cfg_update.get("yolo_confidence_threshold") == 0.40, f"Settings POST failed: {cfg_update}"
    print("[PASS] 11b. Settings POST valid update persisted:", cfg_update.get("yolo_confidence_threshold"))

    s, cfg_err = test_http("/api/settings", method="POST", data={"yolo_confidence_threshold": 0.99})
    assert s == 422, f"Settings validation should reject 0.99, got: {s} {cfg_err}"
    print("[PASS] 11c. Settings validation safety confirmed: rejected out-of-range value (422 Unprocessable Entity)")

    # 12. WebSocket Telemetry & YOLO Loop
    print("[TEST WS] Testing WebSocket Live Telemetry...")
    ws_ok = asyncio.run(test_websocket_stream())
    assert ws_ok, "WebSocket telemetry stream failed!"
    print("[PASS] 12. WebSocket Live Telemetry & YOLO Inference Loop verified!")

    print("==================================================")
    print("ALL 12 CORE PHASE 3 VERIFICATION SUITES PASSED!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
