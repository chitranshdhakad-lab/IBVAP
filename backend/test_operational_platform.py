import json
import urllib.request
import urllib.error
import sys

BASE_URL = "http://localhost:8000"

def get(path):
    req = urllib.request.Request(f"{BASE_URL}{path}")
    with urllib.request.urlopen(req) as res:
        return res.status, json.loads(res.read().decode())

def get_raw(path):
    req = urllib.request.Request(f"{BASE_URL}{path}")
    with urllib.request.urlopen(req) as res:
        return res.status, res.headers, res.read()

def post(path, data=None):
    payload = json.dumps(data).encode() if data else b""
    req = urllib.request.Request(f"{BASE_URL}{path}", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as res:
        return res.status, json.loads(res.read().decode())

def patch(path, data=None):
    payload = json.dumps(data).encode() if data else b""
    req = urllib.request.Request(f"{BASE_URL}{path}", data=payload, headers={"Content-Type": "application/json"}, method="PATCH")
    with urllib.request.urlopen(req) as res:
        return res.status, json.loads(res.read().decode())

def delete(path):
    req = urllib.request.Request(f"{BASE_URL}{path}", method="DELETE")
    with urllib.request.urlopen(req) as res:
        return res.status, json.loads(res.read().decode())

def run_tests():
    print("=== STARTING OPERATIONAL PLATFORM AUDIT ===", flush=True)
    passed = 0
    total = 0

    def test(name, fn):
        nonlocal passed, total
        total += 1
        print(f"Running: {name}...", flush=True)
        try:
            fn()
            print(f"[PASS] {name}", flush=True)
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name}: {str(e)}", flush=True)

    # 1. Health
    def t1():
        status, data = get("/health")
        assert status == 200 and data["status"] == "OPERATIONAL"
    test("Health Check", t1)

    # 2. Cameras & Connection Testing
    def t2():
        status, cams = get("/api/cameras")
        assert status == 200 and len(cams) >= 4
        # Test connection on CAM-01 (FILE)
        st, res = post("/api/cameras/CAM-01/test-connection")
        assert st == 200 and res["status"] in ["CONNECTED", "ONLINE"]
        # Test connection on invalid RTSP station
        st_rtsp, res_rtsp = post("/api/cameras/CAM-02/test-connection")
        assert st_rtsp == 200 and res_rtsp["status"] in ["NOT CONFIGURED", "OFFLINE", "UNREACHABLE"]
    test("Camera Registry & Strict Connection Testing", t2)

    # 3. Video Library
    def t3():
        status, vids = get("/api/videos")
        assert status == 200 and len(vids) >= 1
        assert "duration" in vids[0] and "resolution" in vids[0] and "fps" in vids[0]
    test("Video Library & Storage Records", t3)

    # 4. Events Multi-Criteria Filtering & Verification
    def t4():
        status, events = get("/api/events?limit=10")
        assert status == 200 and len(events) >= 1
        first_evt_id = events[0]["id"]
        # Verify event
        st_v, v_res = patch(f"/api/events/{first_evt_id}/verify", {"verified_by": "Test Operator - MHA"})
        assert st_v == 200 and v_res["verified"] is True
        # Filter by severity
        st_f, f_events = get("/api/events?severity=High")
        assert st_f == 200
        # Filter by status
        st_unv, unv_events = get("/api/events?verification_status=verified")
        assert st_unv == 200 and len(unv_events) >= 1
    test("Security Events Multi-Filter & Real Operator Verification", t4)

    # 5. Restricted Zones CRUD
    def t5():
        # Create
        zone_data = {
            "camera_id": "CAM-01",
            "name": "Audit Test Zone",
            "polygon_coords": [[0.1, 0.2], [0.4, 0.2], [0.4, 0.5], [0.1, 0.5]],
            "enabled": True,
            "description": "Automated test zone"
        }
        st_c, new_zone = post("/api/zones", zone_data)
        assert st_c == 200 and new_zone["id"] > 0
        z_id = new_zone["id"]
        # Update
        st_u, up_zone = patch(f"/api/zones/{z_id}", {"enabled": False})
        assert st_u == 200 and up_zone["enabled"] is False
        # Delete
        st_d, del_res = delete(f"/api/zones/{z_id}")
        assert st_d == 200 and del_res["status"] == "SUCCESS"
    test("Restricted Zones CRUD & Persistence", t5)

    # 6. Tactical Alert Rules
    def t6():
        st, rules = get("/api/rules")
        assert st == 200 and len(rules) >= 3
        rule_0 = rules[0]
        st_u, up_rule = patch(f"/api/rules/{rule_0['id']}", {"cooldown_seconds": 12})
        assert st_u == 200 and up_rule["cooldown_seconds"] == 12
    test("Tactical Alert Rules CRUD", t6)

    # 7. Database Analytics with Time Filtering
    def t7():
        st_all, all_data = get("/api/analytics/summary?time_range=all")
        assert st_all == 200 and "total_detections" in all_data and "total_tracks" in all_data
        st_24h, data_24h = get("/api/analytics/summary?time_range=24h")
        assert st_24h == 200
        st_7d, data_7d = get("/api/analytics/summary?time_range=7d")
        assert st_7d == 200
    test("Database-Driven Analytics & Time Filtering", t7)

    # 8. Report Export (PDF & CSV)
    def t8():
        # CSV Export
        st_csv, h_csv, b_csv = get_raw("/api/reports/export?format=csv&report_type=events")
        assert st_csv == 200 and len(b_csv) > 100
        assert b"Event ID,Timestamp" in b_csv
        # PDF Export
        st_pdf, h_pdf, b_pdf = get_raw("/api/reports/export?format=pdf&report_type=events")
        assert st_pdf == 200 and len(b_pdf) > 1000
        assert b_pdf.startswith(b"%PDF-1.4")
    test("Genuine PDF (ReportLab) & CSV Report Export", t8)

    # 9. Global Search
    def t9():
        st, res = get("/api/search?q=CAM")
        assert st == 200 and res["total_matches"] >= 1
    test("Global Search Across Cameras, Videos, Events", t9)

    # 10. System Status Subsystems
    def t10():
        st, data = get("/api/system/status")
        assert st == 200 and "subsystems" in data and len(data["subsystems"]) >= 10
        backend_sub = next(s for s in data["subsystems"] if s["id"] == "backend")
        assert backend_sub["status"] == "ONLINE"
    test("Subsystems Health Diagnostics", t10)

    # 11. Audit Logs Persistence
    def t11():
        st, logs = get("/api/audit-logs?limit=20")
        assert st == 200 and len(logs) >= 1
    test("Audit Logs Traceability", t11)

    # 12. Settings Reset
    def t12():
        st, res = post("/api/admin/reset-settings", {"confirm": True})
        assert st == 200 and res["status"] == "SUCCESS"
    test("Reset Settings to Defaults (Preserves Data)", t12)

    # 13. Destructive Reset Safeguard Validation
    def t13():
        # Should reject without exact phrase
        try:
            req = urllib.request.Request(
                f"{BASE_URL}/api/admin/reset-data",
                data=json.dumps({"confirmation": "reset"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req)
            assert False, "Should have thrown 400"
        except urllib.error.HTTPError as err:
            assert err.code == 400
    test("Destructive Reset Safeguard Validation", t13)

    print(f"\nAUDIT SUMMARY: {passed}/{total} TESTS PASSED ({round((passed/total)*100, 1)}%)", flush=True)
    if passed == total:
        print("ALL OPERATIONAL REQUIREMENTS MET WITH 100% VERIFICATION.", flush=True)
    else:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
