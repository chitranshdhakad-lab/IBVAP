import asyncio
import os
import time
import json
import logging
from typing import Dict, Optional
from pathlib import Path
import cv2

from app.config import VIDEOS_DIR
from app.database import SessionLocal
from app.models import Video
from app.ai.pipeline import SurveillancePipeline, update_stream_frame, get_latest_stream_frame
from app.services.job_manager import job_manager
from app.services.connection_manager import manager

logger = logging.getLogger("surveillance.services.surveillance_service")

def update_db_video_status(filename: str, status: str):
    """Synchronize processing status into SQLite database."""
    db = SessionLocal()
    try:
        v = db.query(Video).filter(Video.filename == filename).first()
        if v:
            v.processing_status = status
            db.commit()
    except Exception as e:
        logger.error(f"Failed to update video DB status for {filename}: {e}")
    finally:
        db.close()

class SurveillanceService:
    """
    Centralized, asynchronous surveillance analysis engine for IBVAP.
    Runs continuous CV processing (OpenCV -> YOLOv8 -> ByteTrack -> Rule Engine -> Telemetry -> Stream)
    independently of specific WebSocket connections.
    """
    def __init__(self):
        self._tasks: Dict[str, asyncio.Task] = {}
        self._pipelines: Dict[str, SurveillancePipeline] = {}
        self._is_paused: Dict[str, bool] = {}
        self._selected_videos: Dict[str, str] = {}

    def is_running(self, camera_id: str = "CAM-01") -> bool:
        task = self._tasks.get(camera_id)
        return task is not None and not task.done()

    def get_selected_video(self, camera_id: str = "CAM-01") -> str:
        return self._selected_videos.get(camera_id, "Border_Test_03.mp4")

    def select_video(self, camera_id: str, video_filename: str):
        prev = self._selected_videos.get(camera_id)
        self._selected_videos[camera_id] = video_filename
        job_manager.active_video_filename = video_filename
        if self.is_running(camera_id) and prev != video_filename:
            logger.info(f"Switching active surveillance stream for {camera_id} from {prev} to {video_filename}")
            self.start_session(camera_id, video_filename, loop=False, frame_stride=2)

    def start_session(
        self,
        camera_id: str = "CAM-01",
        video_filename: Optional[str] = None,
        loop: bool = False,
        frame_stride: Optional[int] = None,
        speed_mode: str = "fast"
    ):
        """Starts a continuous CV analysis session in the background."""
        chosen_video = video_filename or self.get_selected_video(camera_id)
        self._selected_videos[camera_id] = chosen_video
        job_manager.active_video_filename = chosen_video

        # Stop existing session if running
        if self.is_running(camera_id):
            self.stop_session(camera_id)

        self._is_paused[camera_id] = False
        task = asyncio.create_task(
            self._worker(camera_id, chosen_video, loop=loop, frame_stride=frame_stride, speed_mode=speed_mode)
        )
        self._tasks[camera_id] = task
        logger.info(f"Started surveillance analysis worker for {camera_id} on {chosen_video} (speed_mode={speed_mode})")
        return task

    def stop_session(self, camera_id: str = "CAM-01"):
        """Stops the active analysis session."""
        self._is_paused[camera_id] = False
        task = self._tasks.get(camera_id)
        if task and not task.done():
            task.cancel()
        self._tasks.pop(camera_id, None)
        self._pipelines.pop(camera_id, None)

        cur_vid = self.get_selected_video(camera_id)
        job_manager.stop_job()
        update_db_video_status(cur_vid, "STOPPED")

        stop_packet = {
            "camera_id": camera_id,
            "video_filename": cur_vid,
            "analysis_active": False,
            "job_status": "STOPPED",
            "timestamp": time.strftime("%H:%M:%S"),
            "live_intelligence": {"persons": 0, "vehicles": 0, "animals": 0, "active_tracks": 0},
            "threat_assessment": {"score": 0, "level": "SECURE", "description": "Sector standby. Analysis halted.", "key_factors": []},
            "active_entities": [],
            "latest_event": None
        }
        asyncio.create_task(manager.broadcast_to_camera(camera_id, json.dumps(stop_packet)))
        logger.info(f"Stopped surveillance analysis worker for {camera_id}")

    def pause_session(self, camera_id: str = "CAM-01"):
        self._is_paused[camera_id] = True
        job_manager.pause_job()
        cur_vid = self.get_selected_video(camera_id)
        paused_packet = {
            "camera_id": camera_id,
            "video_filename": cur_vid,
            "analysis_active": True,
            "job_status": "PAUSED",
            "timestamp": time.strftime("%H:%M:%S")
        }
        asyncio.create_task(manager.broadcast_to_camera(camera_id, json.dumps(paused_packet)))

    def resume_session(self, camera_id: str = "CAM-01"):
        self._is_paused[camera_id] = False
        job_manager.resume_job()
        cur_vid = self.get_selected_video(camera_id)
        resumed_packet = {
            "camera_id": camera_id,
            "video_filename": cur_vid,
            "analysis_active": True,
            "job_status": "RUNNING",
            "timestamp": time.strftime("%H:%M:%S")
        }
        asyncio.create_task(manager.broadcast_to_camera(camera_id, json.dumps(resumed_packet)))

    async def _worker(
        self,
        camera_id: str,
        video_filename: str,
        loop: bool,
        frame_stride: Optional[int] = None,
        speed_mode: str = "fast"
    ):
        video_path = str(VIDEOS_DIR / video_filename)
        if not os.path.exists(video_path):
            logger.error(f"Cannot start analysis: Video file {video_path} does not exist.")
            job_manager.fail_job(f"File not found: {video_filename}")
            return

        pipeline = SurveillancePipeline(camera_id=camera_id, video_path=video_path)
        self._pipelines[camera_id] = pipeline

        job_manager.start_job(
            video_filename=video_filename,
            camera_id=camera_id,
            total_frames=pipeline.total_frames,
            fps=pipeline.fps
        )
        update_db_video_status(video_filename, "RUNNING")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"OpenCV failed to open video file {video_path}")
            job_manager.fail_job("OpenCV open failure")
            return

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or pipeline.total_frames or 270)

        # Refined smooth temporal stride according to speed_mode (prevents jerky jumping)
        if frame_stride is None:
            if speed_mode == "realtime":
                stride = 1
                speed_multiplier = 1.0
            elif speed_mode == "max":
                stride = 3
                speed_multiplier = 2.5
            else:  # "fast" (default recommended for balanced detection & smoothness)
                stride = 2
                speed_multiplier = 1.5
        else:
            stride = max(1, frame_stride)
            speed_multiplier = 1.0

        effective_fps = max(15.0, min(30.0, fps))
        target_delay = (stride / effective_fps) / max(0.5, speed_multiplier)

        frame_idx = 0
        last_intel = {"persons": 0, "vehicles": 0, "animals": 0, "active_tracks": 0}
        last_threat = {"score": 10, "level": "SECURE", "description": "Monitoring armed", "key_factors": []}

        try:
            while True:
                if self._is_paused.get(camera_id, False):
                    await asyncio.sleep(0.2)
                    continue

                t0 = time.time()
                ret, frame = cap.read()
                if not ret:
                    if loop:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        frame_idx = 0
                        continue
                    else:
                        logger.info(f"Video {video_filename} reached EOF at frame {frame_idx}")
                        break

                video_timestamp = frame_idx / fps

                # Run YOLOv8 + ByteTrack + Rules via executor
                packet = await asyncio.to_thread(pipeline.process_frame, frame, frame_idx, video_timestamp)
                packet["job_status"] = "RUNNING"
                packet["video_filename"] = video_filename

                if "live_intelligence" in packet:
                    last_intel = packet["live_intelligence"]
                if "threat_assessment" in packet:
                    last_threat = packet["threat_assessment"]

                job_manager.update_progress(
                    processed_frames=frame_idx + 1,
                    detections_increment=len(packet.get("active_entities", [])),
                    events_increment=1 if packet.get("latest_event") else 0,
                    threat_score=packet.get("threat_assessment", {}).get("score", 10)
                )

                # Broadcast live telemetry over WebSocket to all clients
                await manager.broadcast_to_camera(camera_id, json.dumps(packet))

                # Advance by adaptive stride
                if stride > 1:
                    for _ in range(stride - 1):
                        skip_ret = cap.grab()
                        frame_idx += 1
                        if not skip_ret:
                            break

                frame_idx += 1

                # Frame pacing to match accelerated video clock
                elapsed = time.time() - t0
                sleep_time = max(0.002, target_delay - elapsed)
                await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            logger.info(f"Analysis worker for {camera_id} cancelled.")
        except Exception as e:
            logger.error(f"Error in analysis worker for {camera_id}: {e}", exc_info=True)
            job_manager.fail_job(str(e))
        finally:
            cap.release()
            if not loop:
                job_manager.complete_job()
                update_db_video_status(video_filename, "COMPLETED")
                comp_packet = {
                    "camera_id": camera_id,
                    "video_filename": video_filename,
                    "analysis_active": False,
                    "job_status": "COMPLETED",
                    "frame_index": total_frames,
                    "total_frames": total_frames,
                    "progress_percent": 100.0,
                    "live_intelligence": last_intel,
                    "threat_assessment": last_threat,
                    "active_entities": [],
                    "latest_event": None
                }
                await manager.broadcast_to_camera(camera_id, json.dumps(comp_packet))

surveillance_service = SurveillanceService()
