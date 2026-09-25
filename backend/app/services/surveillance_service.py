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
from app.models import Video, Camera
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
        if camera_id in self._selected_videos:
            return self._selected_videos[camera_id]
        if os.path.exists(VIDEOS_DIR):
            files = [f for f in os.listdir(VIDEOS_DIR) if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))]
            if files:
                return files[0]
        return ""

    def select_video(self, camera_id: str, video_filename: str):
        prev = self._selected_videos.get(camera_id)
        if self.is_running(camera_id) and prev != video_filename:
            logger.info(f"Switching active surveillance stream for {camera_id} from {prev} to {video_filename}")
            # start_session must compare against the previous selection before it
            # is replaced; doing the assignment above made every switch a no-op.
            self.start_session(camera_id, video_filename, loop=False, frame_stride=None)
        else:
            self._selected_videos[camera_id] = video_filename
            job_manager.active_video_filename = video_filename

    def _safe_create_task(self, coro):
        try:
            loop = asyncio.get_running_loop()
            return loop.create_task(coro)
        except RuntimeError:
            try:
                loop = asyncio.get_event_loop()
                return loop.create_task(coro)
            except Exception:
                return None

    def start_session(
        self,
        camera_id: str = "CAM-01",
        video_filename: Optional[str] = None,
        loop: bool = False,
        frame_stride: Optional[int] = None,
        speed_mode: str = "realtime"
    ):
        """Starts a continuous CV analysis session in the background."""
        chosen_video = video_filename or self.get_selected_video(camera_id)
        previous_video = self._selected_videos.get(camera_id)

        # If already running the requested video on this camera, avoid duplicate cancellation
        if self.is_running(camera_id):
            if previous_video == chosen_video:
                logger.info(f"Session already running for {camera_id} on {chosen_video}, ignoring duplicate start request.")
                return self._tasks.get(camera_id)
            self.stop_session(camera_id)

        # Keep the old selection until after the comparison above.  Updating it first
        # made every running session appear to already be using the newly selected file.
        self._selected_videos[camera_id] = chosen_video
        job_manager.active_video_filename = chosen_video
        self._is_paused[camera_id] = False
        task = self._safe_create_task(
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
        from app.routers.videos import active_analysis_tasks
        active_analysis_tasks.pop(cur_vid, None)
        active_analysis_tasks.pop(camera_id, None)

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
        self._safe_create_task(manager.broadcast_to_camera(camera_id, json.dumps(stop_packet)))
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
        self._safe_create_task(manager.broadcast_to_camera(camera_id, json.dumps(paused_packet)))

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
        self._safe_create_task(manager.broadcast_to_camera(camera_id, json.dumps(resumed_packet)))


    async def _worker(
        self,
        camera_id: str,
        video_filename: str,
        loop: bool,
        frame_stride: Optional[int] = None,
        speed_mode: str = "realtime"
    ):
        video_path = str(VIDEOS_DIR / video_filename)
        if not os.path.exists(video_path):
            logger.error(f"Cannot start analysis: Video file {video_path} does not exist.")
            job_manager.fail_job(f"File not found: {video_filename}")
            return

        db_cam = SessionLocal()
        cam_obj = db_cam.query(Camera).filter(Camera.id == camera_id).first()
        cam_rz = cam_obj.restricted_zone if cam_obj and cam_obj.restricted_zone else None
        cam_bl = cam_obj.border_line if cam_obj and cam_obj.border_line else None
        vid_obj = db_cam.query(Video).filter(Video.filename == video_filename).first()
        video_id = vid_obj.id if vid_obj else None
        db_cam.close()

        pipeline = SurveillancePipeline(
            camera_id=camera_id,
            video_path=video_path,
            video_id=video_id,
            restricted_zone=cam_rz,
            border_line=cam_bl
        )
        self._pipelines[camera_id] = pipeline

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"OpenCV failed to open video file {video_path}")
            job_manager.fail_job("OpenCV open failure")
            return

        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or pipeline.total_frames or 0)
        if total_frames <= 0:
            cnt = 0
            while cap.grab():
                cnt += 1
            total_frames = cnt
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

        job_manager.start_job(
            video_filename=video_filename,
            camera_id=camera_id,
            total_frames=total_frames,
            fps=fps
        )
        update_db_video_status(video_filename, "RUNNING")

        # Smart stride and speed pacing
        if frame_stride is not None and frame_stride > 0:
            stride = max(1, frame_stride)
        elif speed_mode == "max":
            stride = max(4, round(fps / 5.0))
        elif speed_mode == "fast":
            stride = max(2, round(fps / 10.0))
        else:  # "realtime"
            # Never discard source frames in real-time mode.  Skipping every
            # other frame was the direct cause of visibly jerky motion.
            stride = 1

        speed_multiplier = 1.0 if speed_mode == "realtime" else (2.0 if speed_mode == "fast" else 4.0)
        target_delay = (stride / max(1.0, fps)) / speed_multiplier

        frame_idx = 0
        last_intel = {"persons": 0, "vehicles": 0, "animals": 0, "active_tracks": 0}
        last_threat = {"score": 0, "level": "SECURE", "description": "Monitoring armed", "key_factors": []}
        last_telemetry_broadcast = 0.0

        reached_eof = False
        was_cancelled = False
        start_wall_time = None

        try:
            while True:
                if self._is_paused.get(camera_id, False):
                    await asyncio.sleep(0.2)
                    if start_wall_time is not None:
                        start_wall_time = time.time() - (frame_idx / max(1.0, fps) / speed_multiplier)
                    continue

                t0 = time.time()
                ret, frame = cap.read()
                if not ret:
                    if loop:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        frame_idx = 0
                        start_wall_time = time.time()
                        continue
                    else:
                        logger.info(f"Video {video_filename} reached EOF cleanly at frame {frame_idx}/{total_frames}")
                        reached_eof = True
                        break

                # Initialize start_wall_time on first actual frame so model loading latency doesn't drop frames
                if start_wall_time is None:
                    start_wall_time = time.time()

                # Precise container timestamp from OpenCV millisecond clock
                msec = cap.get(cv2.CAP_PROP_POS_MSEC)
                if msec > 0:
                    video_timestamp = round(msec / 1000.0, 3)
                else:
                    video_timestamp = round(frame_idx / max(1.0, fps), 3)

                # Run YOLOv8 + Tracker + Rules on this exact frame
                packet = await asyncio.to_thread(pipeline.process_frame, frame, frame_idx, video_timestamp)
                packet["job_status"] = "RUNNING"
                packet["video_filename"] = video_filename
                packet["analysis_active"] = True

                if "live_intelligence" in packet:
                    last_intel = packet["live_intelligence"]
                if "threat_assessment" in packet:
                    last_threat = packet["threat_assessment"]

                job_manager.update_progress(
                    processed_frames=frame_idx + 1,
                    detections_increment=len(packet.get("active_entities", [])),
                    events_increment=1 if packet.get("latest_event") else 0,
                    threat_score=packet.get("threat_assessment", {}).get("score", 0)
                )

                # Broadcast live telemetry over WebSocket (throttled to ~10-12 Hz or immediate on events)
                now = time.time()
                if (now - last_telemetry_broadcast >= 0.09) or packet.get("latest_event"):
                    await manager.broadcast_to_camera(camera_id, json.dumps(packet))
                    last_telemetry_broadcast = now

                # Advance by stride
                if stride > 1:
                    for _ in range(stride - 1):
                        skip_ret = cap.grab()
                        frame_idx += 1
                        if not skip_ret:
                            reached_eof = True
                            break

                # Gentle real-time clock synchronization: keep motion smooth without jerky skipping
                elapsed_wall = time.time() - start_wall_time
                target_video_sec = elapsed_wall * speed_multiplier
                current_video_sec = frame_idx / max(1.0, fps)
                lag_seconds = target_video_sec - current_video_sec

                if lag_seconds > 0.18:
                    # Catch up at most 1 frame per cycle to keep motion smooth
                    if cap.grab():
                        frame_idx += 1
                    # If lag is larger than 0.4s, re-align clock anchor to avoid repeated drops
                    if lag_seconds > 0.4:
                        start_wall_time = time.time() - (current_video_sec / speed_multiplier)

                frame_idx += 1

                # Frame pacing to match video clock
                elapsed = time.time() - t0
                sleep_time = max(0.001, target_delay - elapsed)
                await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            was_cancelled = True
            logger.info(f"Analysis worker for {camera_id} cancelled.")
        except Exception as e:
            logger.error(f"Error in analysis worker for {camera_id}: {e}", exc_info=True)
            job_manager.fail_job(str(e))
        finally:
            cap.release()
            self._pipelines.pop(camera_id, None)
            self._tasks.pop(camera_id, None)
            from app.routers.videos import active_analysis_tasks
            active_analysis_tasks.pop(video_filename, None)
            active_analysis_tasks.pop(camera_id, None)
            try:
                db_clean = SessionLocal()
                v_obj = db_clean.query(Video).filter(Video.filename == video_filename).first()
                if v_obj:
                    active_analysis_tasks.pop(v_obj.id, None)
                    active_analysis_tasks.pop(str(v_obj.id), None)
                db_clean.close()
            except Exception:
                pass

            # ONLY broadcast COMPLETED if EOF was reached naturally and worker was NOT cancelled
            if reached_eof and not was_cancelled and not loop:
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
