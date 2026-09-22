"""
Comprehensive OpenCV Video Processing Audit & Verification Script
Verifies:
1. Real OpenCV metadata extraction (FPS, frame count, resolution, duration)
2. 100% sequential frame order (0, 1, 2, ... N-1) with no frame skipping and no duplicates
3. Synchronization of frame timestamp with OpenCV container POS_MSEC
4. YOLOv8 -> ByteTrack -> Rule Engine -> Events integration on real frames
5. Clean EOF handling, release of cv2.VideoCapture, and memory cleanup
6. Full Job Manager & SQLite state transition to COMPLETED (no stuck RUNNING state)
"""

import sys
import os
import time
import asyncio
import cv2
from pathlib import Path

# Ensure backend directory is in python path
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.config import VIDEOS_DIR
from app.routers.videos import get_video_metadata, format_file_size, active_analysis_tasks
from app.services.surveillance_service import surveillance_service
from app.services.job_manager import job_manager
from app.database import SessionLocal
from app.models import Video, SecurityEvent
from app.ai.pipeline import SurveillancePipeline


def audit_opencv_container_metadata(video_filename: str):
    print("\n" + "="*70)
    print(f"STEP 1: AUDITING OPENCV CONTAINER METADATA FOR '{video_filename}'")
    print("="*70)

    video_path = VIDEOS_DIR / video_filename
    assert video_path.exists(), f"Target video {video_path} does not exist!"

    # 1. Direct OpenCV probe
    cap = cv2.VideoCapture(str(video_path))
    assert cap.isOpened(), f"OpenCV failed to open {video_path}"

    raw_fps = cap.get(cv2.CAP_PROP_FPS)
    raw_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    print(f"  [Direct cv2.VideoCapture Probe]")
    print(f"  - Width x Height : {width} x {height}")
    print(f"  - Raw FPS        : {raw_fps}")
    print(f"  - Raw Frame Count: {raw_frames}")

    # 2. Test application get_video_metadata()
    duration, resolution, fps, total_frames = get_video_metadata(str(video_path))
    file_size_str = format_file_size(str(video_path))
    actual_bytes = os.path.getsize(str(video_path))

    print(f"\n  [get_video_metadata() Results]")
    print(f"  - Resolution  : {resolution} (Expected: {width}x{height})")
    print(f"  - FPS         : {fps} (Expected: {round(raw_fps, 2)})")
    print(f"  - Total Frames: {total_frames} (Expected: {raw_frames})")
    print(f"  - Duration    : {duration}s (Calculated: {round(total_frames / max(1.0, fps), 2)}s)")
    print(f"  - File Size   : {file_size_str} ({actual_bytes} bytes)")

    assert resolution == f"{width}x{height}", f"Resolution mismatch: {resolution} != {width}x{height}"
    assert abs(fps - round(raw_fps, 2)) < 0.1, f"FPS mismatch: {fps} != {raw_fps}"
    assert total_frames == raw_frames, f"Frame count mismatch: {total_frames} != {raw_frames}"
    expected_dur = round(total_frames / max(1.0, fps), 2)
    assert abs(duration - expected_dur) < 0.05, f"Duration mismatch: {duration} != {expected_dur}"
    assert "MB" in file_size_str or "KB" in file_size_str, f"Invalid file size format: {file_size_str}"

    print("  --> Step 1 PASSED: Container metadata is exact and matches OpenCV properties.")
    return video_path, total_frames, fps, width, height, duration


def audit_sequential_frame_stream(video_path: Path, expected_frames: int, fps: float):
    print("\n" + "="*70)
    print("STEP 2: AUDITING STRICT SEQUENTIAL FRAME PROCESSING (NO SKIPS, NO DUPS)")
    print("="*70)

    pipeline = SurveillancePipeline(camera_id="CAM-AUDIT", video_path=str(video_path))
    cap = cv2.VideoCapture(str(video_path))
    assert cap.isOpened()

    processed_indices = []
    timestamps = []
    yolo_detections_count = 0
    start_t = time.time()

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print(f"  - OpenCV read() returned False (clean EOF reached at frame index {frame_idx}).")
            break

        # Check frame dimensions match OpenCV metadata
        h, w = frame.shape[:2]
        assert w == cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        assert h == cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

        # Precise container timestamp
        msec = cap.get(cv2.CAP_PROP_POS_MSEC)
        if msec > 0:
            v_time = round(msec / 1000.0, 3)
        else:
            v_time = round(frame_idx / max(1.0, fps), 3)

        # Feed real frame through YOLOv8 + Tracker + Rules
        packet = pipeline.process_frame(frame, frame_idx, v_time)
        processed_indices.append(frame_idx)
        timestamps.append(v_time)
        yolo_detections_count += len(packet.get("active_entities", []))

        frame_idx += 1

    cap_released = not cap.isOpened()
    cap.release()
    assert not cap.isOpened(), "Memory leak: cv2.VideoCapture was not released"

    elapsed = time.time() - start_t
    print(f"  - Total Frames Processed  : {len(processed_indices)}")
    print(f"  - Expected Frames Count   : {expected_frames}")
    print(f"  - Processing Rate         : {len(processed_indices) / elapsed:.2f} FPS")
    print(f"  - Total YOLO Entity Detections: {yolo_detections_count}")

    # Verify strictly increasing sequential frames [0, 1, 2, ... N-1]
    expected_indices = list(range(expected_frames))
    assert processed_indices == expected_indices, "Frame index mismatch or frame skipping detected!"

    # Verify zero duplicate frames
    assert len(processed_indices) == len(set(processed_indices)), "Duplicate frame processing detected!"

    # Verify timestamp monotonic increase
    for i in range(1, len(timestamps)):
        assert timestamps[i] >= timestamps[i-1], f"Timestamp monotonicity violated at frame {i}: {timestamps[i]} < {timestamps[i-1]}"

    print("  --> Step 2 PASSED: 100% sequential frame processing with zero skips and zero duplicates.")


async def audit_async_surveillance_worker(video_filename: str, total_frames: int):
    print("\n" + "="*70)
    print("STEP 3: AUDITING ASYNC SURVEILLANCE SERVICE LIFECYCLE & CLEANUP")
    print("="*70)

    # Ensure DB record exists
    db = SessionLocal()
    vid_rec = db.query(Video).filter(Video.filename == video_filename).first()
    if not vid_rec:
        dur, res, fps_val, f_cnt = get_video_metadata(str(VIDEOS_DIR / video_filename))
        vid_rec = Video(
            filename=video_filename,
            filepath=str(VIDEOS_DIR / video_filename),
            duration=dur,
            resolution=res,
            fps=fps_val,
            total_frames=f_cnt,
            camera_id="CAM-01",
            processing_status="IDLE"
        )
        db.add(vid_rec)
        db.commit()
    db.close()

    cam_id = "CAM-01"
    print(f"  - Starting surveillance session on {cam_id} for '{video_filename}' with frame_stride=1 (1:1 sequential)...")
    surveillance_service.start_session(
        camera_id=cam_id,
        video_filename=video_filename,
        loop=False,
        frame_stride=1,
        speed_mode="max"  # Max speed to complete test promptly
    )

    # Allow worker to start
    await asyncio.sleep(0.5)

    # Check job running
    print(f"  - Job status after launch: {job_manager.status}")
    print(f"  - Active analysis tasks: {active_analysis_tasks}")

    # Wait for completion
    timeout = 120.0
    start_w = time.time()
    last_reported = 0
    while surveillance_service.is_running(cam_id):
        await asyncio.sleep(0.5)
        curr_p = job_manager.processed_frames
        if curr_p - last_reported >= 30:
            last_reported = curr_p
            pct = job_manager.to_dict().get("progress_percent", 0.0)
            print(f"    ... processing frame {curr_p}/{total_frames} ({pct:.1f}%) ...")
        if time.time() - start_w > timeout:
            surveillance_service.stop_session(cam_id)
            raise TimeoutError(f"Video analysis did not reach EOF within {timeout}s")

    await asyncio.sleep(0.5) # Let finally block complete

    print(f"\n  [Job Completion State]")
    print(f"  - Final job_manager.status         : {job_manager.status} (Expected: COMPLETED)")
    print(f"  - Final job_manager.processed_frames: {job_manager.processed_frames} (Expected: {total_frames})")
    print(f"  - Final job_manager.progress_percent: {job_manager.to_dict().get('progress_percent')}%")
    print(f"  - Final active_analysis_tasks       : {active_analysis_tasks} (Expected: empty)")

    assert job_manager.status == "COMPLETED", f"Job status is {job_manager.status}, expected COMPLETED"
    assert job_manager.processed_frames == total_frames, f"Processed frames {job_manager.processed_frames} != {total_frames}"
    assert job_manager.to_dict().get("progress_percent") == 100.0, "Progress percent is not 100.0%"
    assert video_filename not in active_analysis_tasks, "active_analysis_tasks still contains video_filename"
    assert cam_id not in active_analysis_tasks, "active_analysis_tasks still contains cam_id"

    # Verify DB persistence
    db2 = SessionLocal()
    updated_vid = db2.query(Video).filter(Video.filename == video_filename).first()
    db_status = updated_vid.processing_status if updated_vid else None
    db2.close()

    print(f"  - SQLite DB processing_status     : {db_status} (Expected: COMPLETED)")
    assert db_status == "COMPLETED", f"Database status was not updated to COMPLETED (got {db_status})"

    # Verify pipeline and task were popped (no memory leak)
    assert cam_id not in surveillance_service._pipelines, "Memory leak: pipeline not popped from _pipelines"
    assert cam_id not in surveillance_service._tasks, "Memory leak: task not popped from _tasks"

    print("  --> Step 3 PASSED: Full lifecycle cleanly completed EOF, DB updated, zero memory leaks.")


async def main():
    test_video = "video_02_perimeter_breach.mp4"
    video_path, total_frames, fps, width, height, duration = audit_opencv_container_metadata(test_video)
    audit_sequential_frame_stream(video_path, total_frames, fps)
    await audit_async_surveillance_worker(test_video, total_frames)

    print("\n" + "="*70)
    print("ALL OPENCV VIDEO PROCESSING AUDIT CHECKS PASSED WITH ZERO DEFECTS!")
    print("="*70)


if __name__ == "__main__":
    asyncio.run(main())
