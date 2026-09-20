import cv2
import os
import time
from app.config import VIDEOS_DIR
from app.ai.pipeline import SurveillancePipeline

vid_name = "Border_Test_03.mp4"
vid_path = str(VIDEOS_DIR / vid_name)
print("VIDEO EXISTS:", os.path.exists(vid_path))

cap = cv2.VideoCapture(vid_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
print(f"FPS: {fps}, TOTAL FRAMES: {frames}, DURATION: {frames/fps:.1f}s")

pipe = SurveillancePipeline(camera_id="CAM-01", video_path=vid_path)
print("DETECTOR TYPE:", pipe.detector.model_type)

for i in range(10):
    ret, frame = cap.read()
    if not ret:
        break
    t0 = time.time()
    packet = pipe.process_frame(frame, i, i / fps)
    elapsed = (time.time() - t0) * 1000
    intel = packet.get("live_intelligence", {})
    threat = packet.get("threat_assessment", {}).get("score", 0)
    dets = packet.get("tracked_detections", [])
    print(f"Frame {i}: {elapsed:.1f}ms | detections: {len(dets)} | intel: {intel} | threat score: {threat}")

cap.release()
print("Test completed successfully.")
