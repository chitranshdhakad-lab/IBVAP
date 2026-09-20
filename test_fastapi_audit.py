import urllib.request
import json

def test_api():
    endpoints = [
        ("GET", "/health", None),
        ("GET", "/api/cameras", None),
        ("GET", "/api/videos", None),
        ("GET", "/api/events", None),
        ("GET", "/api/events/current", None),
        ("GET", "/api/analytics/summary", None),
        ("GET", "/api/analytics/events-by-hour", None),
        ("GET", "/api/analytics/events-by-type", None),
        ("GET", "/api/analytics/threat-history", None),
        ("GET", "/api/system/status", None),
        ("GET", "/api/threat/current", None),
        ("GET", "/api/settings", None),
        ("POST", "/api/cameras/CAM-01/test-connection", {}),
        ("POST", "/api/analysis/start", {"video": "Border_Test_03.mp4", "camera_id": "CAM-01"}),
        ("GET", "/api/analysis/status", None),
        ("POST", "/api/analysis/stop", {})
    ]

    print("=" * 60)
    print("FASTAPI ENDPOINTS AUDIT RESULTS")
    print("=" * 60)
    for method, path, body in endpoints:
        url = f"http://localhost:8000{path}"
        req = urllib.request.Request(url, method=method)
        data_bytes = None
        if body is not None:
            req.add_header("Content-Type", "application/json")
            data_bytes = json.dumps(body).encode("utf-8")
        try:
            with urllib.request.urlopen(req, data=data_bytes, timeout=5) as res:
                content = res.read().decode("utf-8")
                snippet = content[:90] if len(content) > 90 else content
                print(f"[{res.status} OK] {method:4} {path:36} -> {snippet}")
        except urllib.error.HTTPError as he:
            print(f"[{he.code} ERR] {method:4} {path:36} -> {he.read().decode('utf-8')[:90]}")
        except Exception as e:
            print(f"[FAIL] {method:4} {path:36} -> {e}")

if __name__ == "__main__":
    test_api()
