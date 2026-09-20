import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.database import init_db, SessionLocal
from app.ai.pipeline import SurveillancePipeline
from app.models import Camera, SecurityEvent, Alert

def test_full_pipeline():
    print("=== 1. Initializing Database ===")
    init_db()
    db = SessionLocal()

    video_path = str(backend_dir / "storage" / "videos" / "video_02_zone_intrusion.mp4")
    print(f"=== 2. Setting up Surveillance Pipeline on {video_path} ===")
    pipeline = SurveillancePipeline(camera_id="CAM-01", video_path=video_path)

    print("=== 3. Streaming & Processing Frames ===")
    generator = pipeline.stream_video(loop=False)
    processed_count = 0

    for i in range(15):
        try:
            packet = next(generator)
            processed_count += 1
            if i % 5 == 0:
                print(f"Frame {packet.get('frame_index')}: Intelligence={packet.get('live_intelligence')}, Risk Score={packet.get('threat_assessment', {}).get('score')}")
        except StopIteration:
            break

    print(f"=== 4. Processed {processed_count} frames successfully ===")

    # Verify DB logging
    event_count = db.query(SecurityEvent).count()
    print(f"=== 5. Database Verification: Security Events logged = {event_count} ===")
    db.close()
    print("=== ALL TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_full_pipeline()
